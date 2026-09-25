import pg from 'pg';
import {
  ownerDatabaseTarget,
  parseDatabaseURL,
  pgClientConfig,
  ConfigurationError,
  type ConnectionPolicy,
} from './config';
import { migrationLockKey } from './migrator';
import { ensureRuntimeRole } from './runtime-role';
import {
  readMediaRows,
  tableCounts,
  backupExcludedData,
  type BackupCredentialCounts,
  type MediaRows,
} from './lifecycle';
import { readSchemaState, type Migration, type SchemaState } from './schema-state';

export type RestoreCheckpoint =
  | 'receiving'
  | 'loaded'
  | 'verification-failed'
  | 'verified'
  | 'access-reset'
  | 'media-moved'
  | 'active';
export type RestoreState = { restoreId: string; backupId: string; checkpoint: RestoreCheckpoint };
/** Direct grants only. Inherited access is refused by the runtime-role safety check. */
export type ConnectAccess = { public: boolean; runtime: boolean; runtimeGrantOption: boolean };
export type RestoreAccessReport = {
  snapshotAt: string;
  accounts: number;
  mustChangePassword: number;
  administrators: string[] | null;
  workspaces: Array<{ id: string; name: string; managers: string[]; viewers: string[] }>;
  audit: 'recorded' | 'not supported by this version';
};
export type RestoreOptions = {
  ownerURL: string;
  runtimeURL: string;
  policy?: ConnectionPolicy;
  role?: string;
};
export type RestoreInspection = MediaRows & {
  counts: Record<string, number>;
  migrations: Migration[];
  schema: SchemaState;
};
export type RestoreSession = {
  readState(): Promise<RestoreState | null>;
  preflight(): Promise<ConnectAccess>;
  beginRestore(restoreId: string, backupId: string, previousAccess: ConnectAccess): Promise<void>;
  setBackupId(restoreId: string, backupId: string): Promise<void>;
  checkpoint(
    restoreId: string,
    expected: RestoreCheckpoint,
    next: RestoreCheckpoint,
  ): Promise<void>;
  inspectRestored(restoreId: string): Promise<RestoreInspection>;
  applyCredentialPolicy(
    restoreId: string,
    expected: BackupCredentialCounts,
    snapshotAt: string,
  ): Promise<RestoreAccessReport>;
  accessReport(snapshotAt: string): Promise<RestoreAccessReport>;
  activate(restoreId: string): Promise<void>;
  finish(restoreId: string): Promise<void>;
  discard(restoreId: string, previousAccess: ConnectAccess): Promise<void>;
  release(): Promise<void>;
};
export class RestoreRefusal extends Error {
  constructor(readonly problem: string) {
    super(`Restore refused: ${problem}. The target has not been activated.`);
    this.name = 'RestoreRefusal';
  }
}
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const checkpoints: RestoreCheckpoint[] = [
  'receiving',
  'loaded',
  'verification-failed',
  'verified',
  'access-reset',
  'media-moved',
  'active',
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
function validIdentity(id: string, backupId: string) {
  if (
    uuid.exec(id)?.[0] !== id ||
    (backupId !== 'pending' && hash.exec(backupId)?.[0] !== backupId)
  )
    throw new RestoreRefusal('identity');
}
function validAccess(access: ConnectAccess) {
  if (
    !access ||
    Object.keys(access).sort().join(',') !== 'public,runtime,runtimeGrantOption' ||
    typeof access.public !== 'boolean' ||
    typeof access.runtime !== 'boolean' ||
    typeof access.runtimeGrantOption !== 'boolean' ||
    (access.runtimeGrantOption && !access.runtime)
  )
    throw new RestoreRefusal('connect-record');
}
function number(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new RestoreRefusal('invalid-count');
  return n;
}
type Contents = { object_kind: string; identity: string; namespace: string | null };

/** All state changes use one owner connection under the migration advisory lock. */
export async function openRestoreSession(options: RestoreOptions): Promise<RestoreSession> {
  const policy = options.policy ?? 'loopback';
  const owner = ownerDatabaseTarget(options.ownerURL, policy);
  const runtime = parseDatabaseURL(options.runtimeURL, 'GUIDE_DATABASE_URL', policy);
  const role = options.role ?? 'guide_runtime';
  if (
    runtime.user !== role ||
    owner.user === role ||
    runtime.host !== owner.host ||
    runtime.port !== owner.port ||
    runtime.database !== owner.database
  )
    throw new ConfigurationError(
      'GUIDE_DATABASE_URL',
      'must name the matching database and nonowner runtime role.',
    );
  const database = identifier(owner.database),
    runtimeRole = identifier(role);
  const client = new pg.Client(pgClientConfig(owner));
  let locked = false,
    closed = false,
    releasing: Promise<void> | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  let idleError: Error | undefined;
  client.on('error', (error: Error) => {
    idleError = error;
  });
  const call = <T>(work: () => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(new Error('Restore session is closed.'));
    const next = chain.then(() => {
      if (idleError) throw new Error('Restore database connection was lost.');
      return work();
    });
    chain = next.catch(() => {});
    return next;
  };
  const release = (): Promise<void> => {
    if (!releasing) {
      closed = true;
      releasing = (async () => {
        await chain;
        try {
          if (locked) await client.query('SELECT pg_advisory_unlock($1)', [migrationLockKey]);
        } finally {
          await client.end();
        }
      })();
    }
    return releasing;
  };
  const transaction = async <T>(work: () => Promise<T>, readOnly = false): Promise<T> => {
    await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
    try {
      await client.query('SET LOCAL row_security = off');
      const result = await work();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  };
  const state = async (): Promise<RestoreState | null> => {
    const result = await client.query(
      "SELECT shobj_description(oid,'pg_database') AS comment FROM pg_database WHERE datname=current_database()",
    );
    const comment = result.rows[0]?.comment;
    if (comment === null || comment === undefined) return null;
    if (typeof comment !== 'string') throw new RestoreRefusal('state-invalid');
    const parts = comment.split(' ');
    if (
      parts.length !== 4 ||
      parts[0] !== 'passdown-restore' ||
      !checkpoints.includes(parts[3] as RestoreCheckpoint)
    )
      throw new RestoreRefusal('state-invalid');
    validIdentity(parts[1]!, parts[2]!);
    if (parts[2] === 'pending' && parts[3] !== 'receiving')
      throw new RestoreRefusal('state-invalid');
    return { restoreId: parts[1]!, backupId: parts[2]!, checkpoint: parts[3] as RestoreCheckpoint };
  };
  const required = async (id: string, allowed?: RestoreCheckpoint[]): Promise<RestoreState> => {
    const current = await state();
    if (!current || current.restoreId !== id) throw new RestoreRefusal('identity');
    if (allowed && !allowed.includes(current.checkpoint)) throw new RestoreRefusal('checkpoint');
    return current;
  };
  const writeState = async (record: RestoreState | null) => {
    if (record) validIdentity(record.restoreId, record.backupId);
    await client.query(
      `COMMENT ON DATABASE ${database} IS ${record ? pg.escapeLiteral(`passdown-restore ${record.restoreId} ${record.backupId} ${record.checkpoint}`) : 'NULL'}`,
    );
  };
  const contents = async (): Promise<Contents[]> =>
    (
      await client.query<Contents>(`
    SELECT 'schema' AS object_kind,nspname AS identity,nspname AS namespace FROM pg_namespace
      WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')
    UNION ALL SELECT 'object',pg_describe_object(d.classid,d.objid,d.objsubid),n.nspname
      FROM pg_depend d JOIN pg_namespace n ON d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid
      WHERE n.nspname='public' AND d.objsubid=0
    UNION ALL SELECT 'extension',e.extname,n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname<>'plpgsql'`)
    ).rows;
  const connectAccess = async (): Promise<ConnectAccess> => {
    const grants = (
      await client.query(
        `SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE r.rolname END AS grantee,
      a.is_grantable AS grantable,a.grantor=d.datdba AS owner_grant
      FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
      LEFT JOIN pg_roles r ON r.oid=a.grantee WHERE d.datname=current_database() AND a.privilege_type='CONNECT'
      AND (a.grantee=0 OR r.rolname=$1)`,
        [role],
      )
    ).rows;
    if (grants.some((row) => !row.owner_grant))
      throw new RestoreRefusal('unsupported-connect-grantor');
    return {
      public: grants.some((row) => row.grantee === 'PUBLIC'),
      runtime: grants.some((row) => row.grantee === role),
      runtimeGrantOption: grants.some((row) => row.grantee === role && row.grantable),
    };
  };
  const preflight = async (): Promise<ConnectAccess> => {
    if (await state()) throw new RestoreRefusal('unfinished-restore');
    if ((await contents()).length) throw new RestoreRefusal('target-not-empty');
    return connectAccess();
  };
  const gate = () =>
    client.query(`REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC, ${runtimeRole}`);
  const terminate = async () => {
    await client.query(
      'SELECT pg_terminate_backend(pid,5000) AS terminated FROM pg_stat_activity WHERE datname=$1 AND usename=$2 AND pid<>pg_backend_pid()',
      [owner.database, role],
    );
    const still =
      (
        await client.query(
          'SELECT count(*)::text AS remaining FROM pg_stat_activity WHERE datname=$1 AND usename=$2',
          [owner.database, role],
        )
      ).rows[0]?.remaining ?? 0;
    if (number(still)) throw new RestoreRefusal('runtime-sessions-remain');
  };
  const capabilities = async () =>
    (
      await client.query(`SELECT
    to_regclass('app.invitation') IS NOT NULL AS invitation,
    to_regclass('app.password_reset') IS NOT NULL AS resets,
    to_regprocedure('app.operator_record_restore(jsonb)') IS NOT NULL AS audit,
    to_regprocedure('app.operator_close_all_password_resets()') IS NOT NULL AS "closeResets",
    to_regclass('app.installation_admin') IS NOT NULL AS administrators`)
    ).rows[0];
  const report = async (snapshotAt: string): Promise<RestoreAccessReport> => {
    if (!Number.isFinite(Date.parse(snapshotAt))) throw new RestoreRefusal('snapshot-time');
    const caps = await capabilities();
    const accounts = (
      await client.query(
        'SELECT count(*)::text AS accounts,count(*) FILTER (WHERE must_change_password)::text AS must_change FROM public.auth_user',
      )
    ).rows[0];
    const memberships = (
      await client.query(`SELECT w.id AS workspace_id,w.name AS workspace_name,u.email,m.role
      FROM app.workspace w LEFT JOIN app.membership m ON m.workspace_id=w.id AND m.active
      LEFT JOIN public.auth_user u ON u.id=m.actor_id AND u.active AND u.email_verified ORDER BY w.id,u.email`)
    ).rows;
    const workspaces = new Map<string, RestoreAccessReport['workspaces'][number]>();
    for (const row of memberships) {
      const group = workspaces.get(row.workspace_id) ?? {
        id: row.workspace_id,
        name: row.workspace_name,
        managers: [],
        viewers: [],
      };
      if (row.email) (row.role === 'manage' ? group.managers : group.viewers).push(row.email);
      workspaces.set(row.workspace_id, group);
    }
    const admins = caps.administrators
      ? (
          await client.query(
            'SELECT u.email FROM app.installation_admin a JOIN public.auth_user u ON u.id=a.user_id WHERE u.active AND u.email_verified ORDER BY u.email',
          )
        ).rows.map((row) => row.email)
      : null;
    return {
      snapshotAt,
      accounts: number(accounts.accounts),
      mustChangePassword: number(accounts.must_change),
      administrators: admins,
      workspaces: [...workspaces.values()],
      audit: caps.audit ? 'recorded' : 'not supported by this version',
    };
  };
  try {
    await client.connect();
    if (
      !(await client.query('SELECT pg_try_advisory_lock($1) AS locked', [migrationLockKey])).rows[0]
        ?.locked
    )
      throw new RestoreRefusal('migration-running');
    locked = true;
    const session: RestoreSession = {
      readState: () => call(state),
      preflight: () => call(preflight),
      beginRestore: (id, backupId, previous) =>
        call(async () => {
          validIdentity(id, backupId);
          validAccess(previous);
          await preflight();
          await ensureRuntimeRole({
            ...options,
            role,
            phase: 'before-schema',
            proveLogin: false,
            setPassword: false,
          });
          await transaction(async () => {
            const current = await preflight();
            if (JSON.stringify(current) !== JSON.stringify(previous))
              throw new RestoreRefusal('connect-changed');
            await gate();
            await writeState({ restoreId: id, backupId, checkpoint: 'receiving' });
          });
          await terminate();
        }),
      setBackupId: (id, backupId) =>
        call(() =>
          transaction(async () => {
            validIdentity(id, backupId);
            if (backupId === 'pending') throw new RestoreRefusal('identity');
            const current = await required(id, ['receiving']);
            if (current.backupId !== 'pending' && current.backupId !== backupId)
              throw new RestoreRefusal('identity');
            await writeState({ ...current, backupId });
          }),
        ),
      checkpoint: (id, expected, next) =>
        call(() =>
          transaction(async () => {
            const allowed = new Set([
              'receiving:loaded',
              'loaded:verified',
              'loaded:verification-failed',
              'access-reset:media-moved',
            ]);
            if (!allowed.has(`${expected}:${next}`)) throw new RestoreRefusal('checkpoint');
            const current = await required(id, [expected]);
            if (current.backupId === 'pending') throw new RestoreRefusal('identity');
            await writeState({ ...current, checkpoint: next });
          }),
        ),
      inspectRestored: (id) =>
        call(() =>
          transaction(async () => {
            await required(id, ['loaded', 'verified', 'access-reset', 'media-moved']);
            const counts = await tableCounts(client);
            for (const table of backupExcludedData) {
              const [schema, name] = table.split('.');
              if (Object.hasOwn(counts, table))
                counts[table] = number(
                  (
                    await client.query(
                      `SELECT count(*)::text AS count FROM ${identifier(schema!)}.${identifier(name!)}`,
                    )
                  ).rows[0].count,
                );
            }
            return {
              counts: counts as Record<string, number>,
              migrations: (
                await client.query<Migration>(
                  'SELECT name,checksum FROM public.schema_migration ORDER BY name',
                )
              ).rows,
              schema: await readSchemaState(client),
              ...(await readMediaRows(client)),
            };
          }, true),
        ),
      applyCredentialPolicy: (id, expected, snapshotAt) =>
        call(() =>
          transaction(async () => {
            const current = await required(id, [
              'verified',
              'access-reset',
              'media-moved',
              'active',
            ]);
            if (current.checkpoint !== 'verified') return report(snapshotAt);
            const caps = await capabilities();
            // A schema with reset links must also close them under the account
            // lock and audit the restore; never fall back to editing rows directly.
            if (caps.resets && !(caps.closeResets && caps.audit))
              throw new RestoreRefusal('reset-support-incomplete');
            if (
              !Number.isSafeInteger(expected.pendingInvitations) ||
              expected.pendingInvitations < 0 ||
              (caps.resets
                ? !Number.isSafeInteger(expected.openResetLinks) ||
                  expected.openResetLinks === null ||
                  expected.openResetLinks < 0
                : expected.openResetLinks !== null)
            )
              throw new RestoreRefusal('credential-counts');
            if (
              (await client.query('DELETE FROM public.auth_session')).rowCount !== 0 ||
              (await client.query('DELETE FROM public.auth_verification')).rowCount !== 0
            )
              throw new RestoreRefusal('credential-counts');
            const invitations = caps.invitation
              ? (await client.query('DELETE FROM app.invitation WHERE accepted_at IS NULL'))
                  .rowCount
              : 0;
            if (invitations !== expected.pendingInvitations)
              throw new RestoreRefusal('credential-counts');
            if (caps.resets) {
              const reset = number(
                (await client.query('SELECT app.operator_close_all_password_resets() AS closed'))
                  .rows[0]?.closed,
              );
              if (reset !== expected.openResetLinks) throw new RestoreRefusal('credential-counts');
            }
            if (caps.audit)
              await client.query('SELECT app.operator_record_restore($1::jsonb)', [
                JSON.stringify({ restoreId: id, backupId: current.backupId, snapshotAt }),
              ]);
            await writeState({ ...current, checkpoint: 'access-reset' });
            return report(snapshotAt);
          }),
        ),
      accessReport: (snapshotAt) => call(() => transaction(() => report(snapshotAt), true)),
      activate: (id) =>
        call(async () => {
          await required(id, ['media-moved']);
          await ensureRuntimeRole({
            ...options,
            role,
            phase: 'after-schema',
            probeDatabase: 'postgres',
            setPassword: false,
          });
          await transaction(async () => {
            const current = await required(id, ['media-moved']);
            await client.query(`GRANT CONNECT ON DATABASE ${database} TO ${runtimeRole}`);
            await writeState({ ...current, checkpoint: 'active' });
          });
          const probe = new pg.Client(pgClientConfig(runtime));
          try {
            await probe.connect();
            await probe.query('SELECT name,checksum FROM public.schema_migration ORDER BY name');
          } catch (error) {
            await transaction(async () => {
              const current = await required(id, ['active']);
              await gate();
              await writeState({ ...current, checkpoint: 'media-moved' });
            });
            await terminate();
            throw error;
          } finally {
            await probe.end();
          }
        }),
      finish: (id) =>
        call(() =>
          transaction(async () => {
            await required(id, ['active']);
            await writeState(null);
          }),
        ),
      discard: (id, previous) =>
        call(async () => {
          validAccess(previous);
          const current = await state();
          if (!current || current.restoreId !== id || current.checkpoint === 'active')
            throw new RestoreRefusal('discard-refused');
          await transaction(async () => {
            const again = await state();
            if (!again || again.restoreId !== id || again.checkpoint === 'active')
              throw new RestoreRefusal('discard-refused');
            if (
              (await contents()).some(
                (object) => object.namespace !== 'app' && object.namespace !== 'public',
              )
            )
              throw new RestoreRefusal('unexpected-objects');
            await gate();
            // Preflight proved these namespaces empty. Only this unfinished
            // restore's objects are eligible; unrelated schemas always refuse.
            await client.query('DROP SCHEMA IF EXISTS app CASCADE');
            const extensions = (
              await client.query(
                "SELECT quote_ident(e.extname) AS identity FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE n.nspname='public' AND e.extname<>'plpgsql'",
              )
            ).rows;
            for (const entry of extensions)
              await client.query(`DROP EXTENSION IF EXISTS ${entry.identity} CASCADE`);
            const routines = (
              await client.query(
                "SELECT p.prokind,quote_ident(n.nspname)||'.'||quote_ident(p.proname)||'('||pg_get_function_identity_arguments(p.oid)||')' AS identity FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'",
              )
            ).rows;
            for (const entry of routines)
              await client.query(
                `DROP ${entry.prokind === 'a' ? 'AGGREGATE' : 'ROUTINE'} IF EXISTS ${entry.identity} CASCADE`,
              );
            const relations = (
              await client.query(
                "SELECT c.relkind,quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS identity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m','f')",
              )
            ).rows;
            for (const entry of relations) {
              const kind =
                (
                  {
                    S: 'SEQUENCE',
                    v: 'VIEW',
                    m: 'MATERIALIZED VIEW',
                    f: 'FOREIGN TABLE',
                  } as Record<string, string>
                )[entry.relkind] ?? 'TABLE';
              await client.query(`DROP ${kind} IF EXISTS ${entry.identity} CASCADE`);
            }
            const types = (
              await client.query(
                "SELECT quote_ident(n.nspname)||'.'||quote_ident(t.typname) AS identity FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typelem=0 AND t.typtype IN ('e','d','r','m','c')",
              )
            ).rows;
            for (const entry of types)
              await client.query(`DROP TYPE IF EXISTS ${entry.identity} CASCADE`);
            if ((await contents()).length) throw new RestoreRefusal('discard-incomplete');
            if (previous.public)
              await client.query(`GRANT CONNECT ON DATABASE ${database} TO PUBLIC`);
            if (previous.runtime)
              await client.query(
                `GRANT CONNECT ON DATABASE ${database} TO ${runtimeRole}${previous.runtimeGrantOption ? ' WITH GRANT OPTION' : ''}`,
              );
            await writeState(null);
          });
        }),
      release,
    };
    return session;
  } catch (error) {
    await release().catch(() => {});
    throw error;
  }
}
