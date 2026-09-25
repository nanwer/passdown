import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import {
  ownerDatabaseTarget,
  runtimeDatabaseTarget,
  pgClientConfig,
  type ConnectionPolicy,
} from './config';
import { ensureRuntimeRole } from './runtime-role';
import { expectedMigrations, readSchemaState, type SchemaState } from './schema-state';
export type MigrationValidationProblem = 'build-mismatch' | 'invalid-files' | 'applied-changed';
/** Public operator diagnostic: never includes SQL, URLs or arbitrary file contents. */
export class MigrationValidationError extends Error {
  readonly migration?: string;
  constructor(
    readonly problem: MigrationValidationProblem,
    migration?: string,
  ) {
    const name = migration && /^[a-zA-Z0-9_-]+\.sql$/.test(migration) ? migration : undefined;
    super(
      problem === 'applied-changed' && name
        ? `Applied migration changed: ${name}`
        : problem === 'build-mismatch'
          ? 'Migration files do not match this build. Restore the files shipped with this image.'
          : 'Invalid migration files or checksums. Restore the files shipped with this build.',
    );
    this.name = 'MigrationValidationError';
    this.migration = name;
  }
}
export const migrationLockKey = 719821005;
export type MigrationFile = { name: string; sql: string; checksum: string };
const checksumOf = (sql: string) => createHash('sha256').update(sql).digest('hex');
export function readMigrationDirectory(directory: string): MigrationFile[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(directory, name), 'utf8');
      return { name, sql, checksum: checksumOf(sql) };
    });
}
export function assertMigrationsMatchBuild(files: MigrationFile[]): void {
  const expected = expectedMigrations();
  if (
    files.length !== expected.length ||
    files.some(
      (file, i) =>
        file.name !== expected[i]?.name ||
        file.checksum !== expected[i]?.checksum ||
        file.checksum !== checksumOf(file.sql),
    )
  )
    throw new MigrationValidationError('build-mismatch');
}
export class MigrationFailure extends Error {
  constructor(
    readonly migration: string,
    readonly reason: string,
    readonly outcome: 'rolled-back' | 'uncertain' = 'rolled-back',
  ) {
    super(
      outcome === 'rolled-back'
        ? `Migration ${migration} failed and was rolled back: ${reason}`
        : `Migration ${migration} could not be confirmed: ${reason}. Check schema status before retrying.`,
    );
    this.name = 'MigrationFailure';
  }
}
export async function applyMigrations(options: {
  ownerURL: string;
  runtimeURL: string;
  migrations: MigrationFile[];
  policy?: ConnectionPolicy;
  onWaiting?: () => void;
  onApplying?: (name: string) => void;
  /** After each migration commits, so a caller knows the database changed. */
  onApplied?: (name: string) => void;
}): Promise<{ applied: string[]; total: number }> {
  const policy = options.policy ?? 'loopback';
  const owner = ownerDatabaseTarget(options.ownerURL, policy);
  runtimeDatabaseTarget(options.runtimeURL, policy);
  const files = [...options.migrations].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (
    new Set(files.map((f) => f.name)).size !== files.length ||
    files.some((f) => !/^[a-zA-Z0-9_-]+\.sql$/.test(f.name) || f.checksum !== checksumOf(f.sql))
  )
    throw new MigrationValidationError('invalid-files');
  const client = new pg.Client(pgClientConfig(owner));
  const applied: string[] = [];
  await client.connect();
  try {
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [
      migrationLockKey,
    ]);
    if (!lock.rows[0].locked) {
      options.onWaiting?.();
      await client.query('SELECT pg_advisory_lock($1)', [migrationLockKey]);
    }
    await ensureRuntimeRole({ ...options, phase: 'before-schema' });
    await client.query(
      'CREATE TABLE IF NOT EXISTS public.schema_migration(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    await client.query('GRANT SELECT ON public.schema_migration TO guide_runtime');
    // Validate all applied files before executing any new migration.
    const previous = new Map(
      (await client.query('SELECT name,checksum FROM public.schema_migration')).rows.map((row) => [
        row.name,
        row.checksum,
      ]),
    );
    for (const file of files) {
      if (previous.has(file.name) && previous.get(file.name) !== file.checksum)
        throw new MigrationValidationError('applied-changed', file.name);
    }
    for (const file of files) {
      if (previous.has(file.name)) continue;
      options.onApplying?.(file.name);
      let commitSent = false;
      await client.query('BEGIN');
      try {
        await client.query(file.sql);
        await client.query('INSERT INTO public.schema_migration(name,checksum) VALUES($1,$2)', [
          file.name,
          file.checksum,
        ]);
        commitSent = true;
        await client.query('COMMIT');
        applied.push(file.name);
      } catch (error) {
        let outcome: 'rolled-back' | 'uncertain' = 'uncertain';
        if (!commitSent) {
          try {
            await client.query('ROLLBACK');
            outcome = 'rolled-back';
          } catch {
            /* Connection state cannot be proved. */
          }
        }
        const code =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof error.code === 'string' &&
          /^[A-Z0-9]{5}$/.test(error.code)
            ? `PostgreSQL error ${error.code}`
            : 'database operation failed';
        throw new MigrationFailure(file.name, code, outcome);
      }
      options.onApplied?.(file.name);
    }
    await ensureRuntimeRole({ ...options, phase: 'after-schema' });
    return { applied, total: files.length };
  } finally {
    await client.end();
  }
}
export async function readSchemaStateAsOwner(
  ownerURL: string,
  policy: ConnectionPolicy = 'loopback',
): Promise<SchemaState> {
  const client = new pg.Client(pgClientConfig(ownerDatabaseTarget(ownerURL, policy)));
  await client.connect();
  try {
    return await readSchemaState(client);
  } finally {
    await client.end();
  }
}
