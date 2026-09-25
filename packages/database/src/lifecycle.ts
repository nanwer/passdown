import pg from 'pg';
import type { MediaFileMetadata } from '@guide/contracts';
import { pgClientConfig, type DatabaseTarget } from './config';
import { migrationLockKey } from './migrator';
import type { Migration } from './schema-state';

export const backupExcludedData = [
  'public.auth_session',
  'public.auth_verification',
  'app.rate_limit',
] as const;
export type BackupTableCounts = Record<string, number | null>;
export type BackupCredentialCounts = {
  /** null means this schema predates reset links, rather than an empty reset table. */
  openResetLinks: number | null;
  pendingInvitations: number;
};
export type MediaReference = {
  workspace: string;
  asset: string;
  source:
    | 'guide-document'
    | 'release-document'
    | 'guide-cover'
    | 'release-cover'
    | 'category-image'
    | 'asset-reference';
  sourceId: string;
};
export type DanglingMediaReference = MediaReference;
export type MediaRows = {
  assets: MediaFileMetadata[];
  references: MediaReference[];
  dangling: MediaReference[];
};
export type BackupSnapshot = MediaRows & {
  id: string;
  snapshotAt: string;
  databaseName: string;
  serverVersion: string;
  migrations: Migration[];
  counts: BackupTableCounts;
  credentials: BackupCredentialCounts;
  /** Ends the read-only transaction and releases its migration lock. Safe to call twice. */
  release(): Promise<void>;
};
export class LifecyclePreconditionError extends Error {
  constructor(readonly problem: 'migration-running' | 'uninitialized') {
    super(
      problem === 'migration-running'
        ? 'A migration or another backup is running. Try again after it finishes.'
        : 'The database has no complete application schema to back up.',
    );
    this.name = 'LifecyclePreconditionError';
  }
}
type QueryClient = Pick<pg.Client, 'query'>;
type Table = { schema: string; name: string };
const qualifiedName = ({ schema, name }: Table) => `${schema}.${name}`;
const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;
function countNumber(value: string | number): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new Error('A database count or file size exceeds the supported integer range.');
  return number;
}
async function applicationTables(client: QueryClient): Promise<Table[]> {
  return (
    await client.query<Table>(`
      SELECT n.nspname AS schema,c.relname AS name
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('app','public') AND c.relkind IN ('r','p')
      ORDER BY n.nspname,c.relname`)
  ).rows;
}
/** Call inside the transaction whose rows the backup will contain. */
export async function tableCounts(client: QueryClient): Promise<BackupTableCounts> {
  return countTables(client, await applicationTables(client));
}
async function countTables(client: QueryClient, tables: Table[]): Promise<BackupTableCounts> {
  const counts: BackupTableCounts = {};
  for (const table of tables) {
    const name = qualifiedName(table);
    if (backupExcludedData.some((excluded) => excluded === name)) counts[name] = null;
    else {
      const rows = await client.query(
        `SELECT count(*)::text AS count FROM ${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`,
      );
      counts[name] = countNumber(rows.rows[0].count);
    }
  }
  return counts;
}
async function credentialCounts(
  client: QueryClient,
  names: Set<string>,
): Promise<BackupCredentialCounts> {
  const count = async (sql: string) => countNumber((await client.query(sql)).rows[0].count);
  return {
    openResetLinks: names.has('app.password_reset')
      ? await count(
          'SELECT count(*)::text AS count FROM app.password_reset WHERE used_at IS NULL AND revoked_at IS NULL',
        )
      : null,
    pendingInvitations: names.has('app.invitation')
      ? await count('SELECT count(*)::text AS count FROM app.invitation WHERE accepted_at IS NULL')
      : 0,
  };
}
export async function readMediaRows(client: QueryClient): Promise<MediaRows> {
  const assets = (
    await client.query<Omit<MediaFileMetadata, 'bytes'> & { bytes: string }>(`
      SELECT workspace_id AS workspace,id AS asset,byte_size::text AS bytes,content_hash AS sha256
      FROM app.asset ORDER BY workspace_id,id`)
  ).rows.map((row) => ({ ...row, bytes: countNumber(row.bytes) }));
  // Documents are the source of truth. The access-reference index can itself be
  // incomplete, so checking that table alone would miss corrupt release JSON.
  // UNION also removes duplicates produced by recursive JSON-path traversal.
  const usages = (
    await client.query<MediaReference & { present: boolean }>(`
      WITH picture_references AS (
        SELECT g.workspace_id AS workspace,ref.value #>> '{}' AS asset,
          'guide-document'::text AS source,g.id AS "sourceId"
        FROM app.guide g CROSS JOIN LATERAL jsonb_path_query(g.document,'$.**.assetId') ref(value)
        UNION
        SELECT r.workspace_id,ref.value #>> '{}','release-document',r.guide_id || ':' || r.number
        FROM app.release r CROSS JOIN LATERAL jsonb_path_query(r.document,'$.**.assetId') ref(value)
        UNION
        SELECT workspace_id,cover_asset_id,'guide-cover',id FROM app.guide
        UNION
        SELECT workspace_id,cover_asset_id,'release-cover',guide_id || ':' || number FROM app.release
        UNION
        SELECT workspace_id,image_asset_id,'category-image',id FROM app.category
        UNION
        SELECT workspace_id,asset_id,'asset-reference',guide_id || ':' || release_number FROM app.asset_reference
      )
      SELECT ref.workspace,ref.asset,ref.source,ref."sourceId",a.id IS NOT NULL AS present
      FROM picture_references ref
      LEFT JOIN app.asset a ON a.workspace_id=ref.workspace AND a.id=ref.asset
      WHERE ref.asset IS NOT NULL
      ORDER BY ref.workspace,ref.asset,ref.source,ref."sourceId"`)
  ).rows;
  const references = usages.map(({ present: _, ...reference }) => reference);
  const dangling = usages
    .filter((row) => !row.present)
    .map(({ present: _, ...reference }) => reference);
  return { assets, references, dangling };
}

/** Holds the migration lock and exported snapshot until the caller finishes pg_dump. */
export async function openBackupSnapshot(params: DatabaseTarget): Promise<BackupSnapshot> {
  const client = new pg.Client(pgClientConfig(params));
  let locked = false;
  let transaction = false;
  let released: Promise<void> | undefined;
  let connectionError: Error | undefined;
  // An idle disconnect must reject completion rather than crash the operator.
  client.on('error', (error: Error) => {
    connectionError = error;
  });
  const release = (): Promise<void> => {
    released ??= (async () => {
      const errors: unknown[] = connectionError ? [connectionError] : [];
      if (transaction) {
        try {
          await client.query('ROLLBACK');
        } catch (error) {
          errors.push(error);
        }
      }
      if (locked) {
        try {
          await client.query('SELECT pg_advisory_unlock($1)', [migrationLockKey]);
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        await client.end();
      } catch (error) {
        errors.push(error);
      }
      if (errors.length)
        throw new AggregateError(
          errors,
          'The backup snapshot connection could not be closed cleanly.',
        );
    })();
    return released;
  };
  try {
    await client.connect();
    const result = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [
      migrationLockKey,
    ]);
    if (!result.rows[0]?.locked) throw new LifecyclePreconditionError('migration-running');
    locked = true;
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transaction = true;
    // Refuse silently filtered results if a caller supplied a non-owner account.
    await client.query('SET LOCAL row_security = off');
    const snapshot = (
      await client.query(`SELECT pg_export_snapshot() AS id,
      transaction_timestamp() AS snapshot_at,current_database() AS database_name,
      current_setting('server_version') AS server_version`)
    ).rows[0];
    const tables = await applicationTables(client);
    const names = new Set(tables.map(qualifiedName));
    if (!names.has('public.schema_migration'))
      throw new LifecyclePreconditionError('uninitialized');
    const migrations = (
      await client.query<Migration>(
        'SELECT name,checksum FROM public.schema_migration ORDER BY name',
      )
    ).rows;
    const counts = await countTables(client, tables);
    const credentials = await credentialCounts(client, names);
    const rows = await readMediaRows(client);
    return {
      id: snapshot.id,
      snapshotAt: new Date(snapshot.snapshot_at).toISOString(),
      databaseName: snapshot.database_name,
      serverVersion: snapshot.server_version,
      migrations,
      counts,
      credentials,
      ...rows,
      release,
    };
  } catch (error) {
    await release().catch(() => {
      /* Preserve the original operation failure. */
    });
    throw error;
  }
}
/** Read-only verification inventory; no long-lived exported snapshot escapes this call. */
export async function verifyMediaRows(params: DatabaseTarget): Promise<MediaRows> {
  const snapshot = await openBackupSnapshot(params);
  try {
    return {
      assets: snapshot.assets,
      references: snapshot.references,
      dangling: snapshot.dangling,
    };
  } finally {
    await snapshot.release();
  }
}
