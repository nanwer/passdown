import { mediaFileName } from '@guide/contracts';
import { expectedMigrations } from '@guide/database';

export type FileDigest = { bytes: number; sha256: string };
export type BackupManifest = {
  format: 'passdown-backup/1';
  complete: true;
  createdBy: { passdown: string; revision: string };
  startedAt: string;
  snapshotAt: string;
  completedAt: string;
  database: { name: string; server: string; pgDump: string };
  migrations: { name: string; checksum: string }[];
  counts: Record<string, number | null>;
  excludedData: string[];
  credentials: { openResetLinks: number | null; pendingInvitations: number };
  media: {
    files: number;
    bytes: number;
    missingAtBackup: { workspace: string; asset: string }[];
    renditionsIncluded: false;
  };
  files: { 'database.dump': FileDigest; 'media.tar': FileDigest };
};
export const excludedBackupData = [
  'public.auth_session',
  'public.auth_verification',
  'app.rate_limit',
] as const;
const invalid = () => {
  throw new Error('Invalid or incompatible backup manifest.');
};
function record(value: unknown, keys?: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const result = value as Record<string, unknown>;
  if (
    keys &&
    (Object.keys(result).length !== keys.length || keys.some((key) => !Object.hasOwn(result, key)))
  )
    return invalid();
  return result;
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > 1024 ||
    /[\x00-\x1f]/.test(value)
  )
    return invalid();
  return value;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}
function hash(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) return invalid();
  return value;
}
function date(value: unknown): number {
  const timestamp = text(value);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(timestamp)) return invalid();
  const time = Date.parse(timestamp);
  const normalized = timestamp.includes('.') ? timestamp : timestamp.replace('Z', '.000Z');
  if (!Number.isFinite(time) || new Date(time).toISOString() !== normalized) return invalid();
  return time;
}
export function postgresqlMajor(value: string): number {
  const match =
    /^(?:(?:pg_dump|pg_restore) \(PostgreSQL\) )?(\d+)\.\d+(?:\.\d+)?(?: \([^\r\n]*\))?$/.exec(
      value,
    );
  if (!match) return invalid();
  const major = Number(match[1]);
  if (!Number.isSafeInteger(major) || major < 10) return invalid();
  return major;
}

export function validateManifest(value: unknown, expected = expectedMigrations()): BackupManifest {
  const m = record(value, [
    'format',
    'complete',
    'createdBy',
    'startedAt',
    'snapshotAt',
    'completedAt',
    'database',
    'migrations',
    'counts',
    'excludedData',
    'credentials',
    'media',
    'files',
  ]);
  if (m.format !== 'passdown-backup/1' || m.complete !== true) return invalid();
  const created = record(m.createdBy, ['passdown', 'revision']);
  text(created.passdown);
  text(created.revision);
  const start = date(m.startedAt),
    snapshot = date(m.snapshotAt),
    completed = date(m.completedAt);
  if (start > snapshot || snapshot > completed) return invalid();
  const database = record(m.database, ['name', 'server', 'pgDump']);
  text(database.name);
  postgresqlMajor(text(database.server));
  postgresqlMajor(text(database.pgDump));
  if (!Array.isArray(m.migrations) || m.migrations.length !== expected.length) return invalid();
  m.migrations.forEach((entry, index) => {
    const migration = record(entry, ['name', 'checksum']);
    if (
      text(migration.name) !== expected[index]!.name ||
      hash(migration.checksum) !== expected[index]!.checksum
    )
      return invalid();
  });
  if (
    !Array.isArray(m.excludedData) ||
    JSON.stringify(m.excludedData) !== JSON.stringify(excludedBackupData)
  )
    return invalid();
  const counts = record(m.counts);
  if (!Object.keys(counts).length || excludedBackupData.some((table) => counts[table] !== null))
    return invalid();
  for (const [table, rows] of Object.entries(counts)) {
    if (!/^(app|public)\.[a-z_][a-z0-9_]*$/.test(table)) return invalid();
    if ((excludedBackupData as readonly string[]).includes(table)) {
      if (rows !== null) return invalid();
    } else count(rows);
  }
  const credentials = record(m.credentials, ['openResetLinks', 'pendingInvitations']);
  if (expected.some((migration) => /^032_/.test(migration.name))) count(credentials.openResetLinks);
  else if (credentials.openResetLinks !== null) return invalid();
  count(credentials.pendingInvitations);
  const media = record(m.media, ['files', 'bytes', 'missingAtBackup', 'renditionsIncluded']);
  count(media.files);
  count(media.bytes);
  if (media.renditionsIncluded !== false || !Array.isArray(media.missingAtBackup)) return invalid();
  const missing = new Set<string>();
  for (const entry of media.missingAtBackup) {
    const item = record(entry, ['workspace', 'asset']);
    const workspace = text(item.workspace),
      asset = text(item.asset);
    mediaFileName(workspace, asset);
    const key = `${workspace}/${asset}`;
    if (missing.has(key)) return invalid();
    missing.add(key);
  }
  const files = record(m.files, ['database.dump', 'media.tar']);
  for (const name of ['database.dump', 'media.tar']) {
    const file = record(files[name], ['bytes', 'sha256']);
    count(file.bytes);
    hash(file.sha256);
  }
  return value as BackupManifest;
}
