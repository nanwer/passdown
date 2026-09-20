import pg from 'pg';
import { migrationManifest } from './migration-manifest';

/**
 * Whether the database matches the migrations this build ships with.
 *
 * The application does not apply migrations itself: they stay an explicit
 * deployment step, so a rollout across several processes cannot race and an
 * operator always decides when the schema changes. What the application must
 * never do is serve traffic against a schema it does not match, because the
 * symptom is an unrelated runtime failure on whichever request happens to need
 * the missing object.
 *
 * The expected list is a generated manifest rather than a directory read: the
 * web build bundles this package, and a runtime directory read is not
 * statically resolvable. scripts/migration-manifest.mjs regenerates it and CI
 * fails if it drifts from the .sql files.
 */

export type Migration = { name: string; checksum: string };
export type SchemaState =
  | { ok: true; applied: number }
  | { ok: false; reason: 'pending'; pending: string[]; applied: number }
  | { ok: false; reason: 'changed'; changed: string[]; applied: number }
  | { ok: false; reason: 'uninitialized' };

/** Migrations shipped with this build, in application order. */
export function expectedMigrations(): Migration[] {
  return migrationManifest;
}

/**
 * Compares what this build expects against what the database records.
 *
 * `changed` matters as much as `pending`: an edited migration means the two
 * have diverged in a way re-running cannot repair, so it is reported
 * separately rather than being described as merely behind.
 */
export async function readSchemaState(client: Pick<pg.Client, 'query'>): Promise<SchemaState> {
  const table = await client.query(
    "SELECT to_regclass('public.schema_migration') IS NOT NULL AS present",
  );
  if (!table.rows[0]?.present) return { ok: false, reason: 'uninitialized' };
  const rows = (await client.query('SELECT name,checksum FROM public.schema_migration')).rows as {
    name: string;
    checksum: string;
  }[];
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));
  const expected = expectedMigrations();
  const changed = expected
    .filter(({ name, checksum }) => applied.has(name) && applied.get(name) !== checksum)
    .map(({ name }) => name);
  if (changed.length) return { ok: false, reason: 'changed', changed, applied: applied.size };
  const pending = expected.filter(({ name }) => !applied.has(name)).map(({ name }) => name);
  if (pending.length) return { ok: false, reason: 'pending', pending, applied: applied.size };
  return { ok: true, applied: applied.size };
}

/** One sentence an operator can act on, or null when the schema is current. */
export function describeSchemaState(state: SchemaState): string | null {
  if (state.ok) return null;
  if (state.reason === 'uninitialized')
    return 'This database has no schema yet. Run pnpm local:setup to create it.';
  if (state.reason === 'changed')
    return `These migrations were edited after they were applied: ${state.changed.join(', ')}. The database and this build have diverged; restore the original files or rebuild the database from a backup.`;
  return `This database is missing ${state.pending.length} migration${
    state.pending.length === 1 ? '' : 's'
  } (${state.pending.join(', ')}). Run pnpm local:migrate, then start again.`;
}
