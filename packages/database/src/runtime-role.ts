import pg from 'pg';
import {
  ConfigurationError,
  ownerDatabaseTarget,
  parseDatabaseURL,
  pgClientConfig,
  type ConnectionPolicy,
} from './config';

/** One predicate for runtime transactions, health and owner-side probes. */
function runtimeRoleSafety(subject: string, expected: string) {
  return `EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = ${subject} AND r.rolname = ${expected}
    AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole
    AND NOT EXISTS (SELECT 1 FROM pg_roles elevated WHERE (elevated.rolsuper OR elevated.rolbypassrls)
      AND pg_has_role(r.oid, elevated.oid, 'MEMBER'))
    AND NOT EXISTS (SELECT 1 FROM (
      SELECT relowner AS owner FROM pg_class WHERE oid = to_regclass('app.guide')
      UNION SELECT datdba FROM pg_database WHERE datname = current_database()
    ) protected WHERE pg_has_role(r.oid, protected.owner, 'MEMBER')))`;
}
export const runtimeRoleIsSafe = runtimeRoleSafety('current_user', "'guide_runtime'");
/** Parameterized query fragment; pass values with the owner connection query. */
export function runtimeRoleIsSafeFor(role: string) {
  return { text: `SELECT ${runtimeRoleSafety('$1', '$1')} AS safe`, values: [role] };
}
export type RuntimeRoleProblem =
  'attributes' | 'membership' | 'ownership' | 'password' | 'unsafe' | 'privileges';
export class RuntimeRoleError extends Error {
  constructor(readonly problem: RuntimeRoleProblem) {
    super(`Runtime role check failed: ${problem}.`);
    this.name = 'RuntimeRoleError';
  }
}
const identifier = (value: string) => `"${value.replaceAll('"', '""')}"`;

/** Never grants CONNECT: restore owns the target database's activation gate. */
export async function ensureRuntimeRole(options: {
  ownerURL: string;
  runtimeURL: string;
  policy?: ConnectionPolicy;
  setPassword?: boolean;
  phase?: 'before-schema' | 'after-schema';
  role?: string;
  probeDatabase?: string;
}): Promise<{ created: boolean; passwordChanged: boolean }> {
  const policy = options.policy ?? 'loopback';
  const owner = ownerDatabaseTarget(options.ownerURL, policy);
  const runtime = parseDatabaseURL(options.runtimeURL, 'GUIDE_DATABASE_URL', policy);
  const role = options.role ?? 'guide_runtime';
  if (
    runtime.user !== role ||
    role === owner.user ||
    !role ||
    role.includes('\0') ||
    Buffer.byteLength(role) > 63
  )
    throw new ConfigurationError(
      'GUIDE_DATABASE_URL',
      'must identify the intended nonowner runtime role.',
    );
  if (
    runtime.host !== owner.host ||
    runtime.port !== owner.port ||
    runtime.database !== owner.database
  )
    throw new ConfigurationError(
      'GUIDE_DATABASE_URL',
      'must identify the same database as the owner connection.',
    );
  if (!runtime.password) throw new RuntimeRoleError('password');
  const client = new pg.Client(pgClientConfig(owner));
  let created = false,
    passwordChanged = false;
  await client.connect();
  try {
    const result = await client.query('SELECT * FROM pg_roles WHERE rolname=$1', [role]);
    if (!result.rowCount) {
      await client.query(
        `CREATE ROLE ${identifier(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${pg.escapeLiteral(runtime.password)}`,
      );
      created = true;
    } else {
      const r = result.rows[0];
      if (
        !r.rolcanlogin ||
        r.rolsuper ||
        r.rolcreatedb ||
        r.rolcreaterole ||
        r.rolinherit ||
        r.rolreplication ||
        r.rolbypassrls
      )
        throw new RuntimeRoleError('attributes');
    }
    const memberships = await client.query(
      'SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member WHERE r.rolname=$1 LIMIT 1',
      [role],
    );
    if (memberships.rowCount) throw new RuntimeRoleError('membership');
    const owned = await client.query(
      `SELECT EXISTS(SELECT 1 FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE r.rolname=$1)
      OR EXISTS(SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE r.rolname=$1 AND n.nspname NOT LIKE 'pg_temp_%')
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname=$1 AND c.relpersistence <> 't')
      OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE r.rolname=$1) AS owned`,
      [role],
    );
    if (owned.rows[0].owned) throw new RuntimeRoleError('ownership');
    if (!(await client.query(runtimeRoleIsSafeFor(role))).rows[0]?.safe)
      throw new RuntimeRoleError('unsafe');
    if (options.phase === 'after-schema') {
      const privileges = await client.query(
        `SELECT CASE WHEN to_regnamespace('app') IS NULL OR to_regclass('public.schema_migration') IS NULL THEN false
        ELSE has_schema_privilege($1, 'app', 'USAGE') AND has_table_privilege($1, 'public.schema_migration', 'SELECT') END AS granted`,
        [role],
      );
      if (!privileges.rows[0]?.granted) throw new RuntimeRoleError('privileges');
    }
    if (options.setPassword && !created) {
      await client.query(
        `ALTER ROLE ${identifier(role)} PASSWORD ${pg.escapeLiteral(runtime.password)}`,
      );
      passwordChanged = true;
    }
    const probe = new pg.Client(
      pgClientConfig({ ...runtime, database: options.probeDatabase ?? runtime.database }),
    );
    try {
      await probe.connect();
      const who = await probe.query('SELECT current_user');
      if (who.rows[0]?.current_user !== role) throw new RuntimeRoleError('password');
    } catch {
      throw new RuntimeRoleError('password');
    } finally {
      await probe.end();
    }
    return { created, passwordChanged };
  } finally {
    await client.end();
  }
}
