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
  /**
   * `ahead` names migrations the database has applied that this build knows
   * nothing about — the application is older than the schema it is talking to.
   *
   * That is reported, not refused. During a rolling deploy the new version
   * applies its migrations while old instances are still serving, and refusing
   * there would turn an ordinary release into an outage. It is still worth
   * saying: a long-running process against a database that has moved on is
   * exactly how a dropped column becomes an unrelated request failure.
   */
  | { ok: true; applied: number; ahead: string[] }
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
  const known = new Set(expected.map(({ name }) => name));
  const ahead = [...applied.keys()].filter((name) => !known.has(name)).sort();
  return { ok: true, applied: applied.size, ahead };
}

/**
 * One sentence an operator can act on when the database cannot be served, or
 * null when it can. Being ahead of the build does not stop it being served, so
 * it is not reported here — see describeSchemaDrift.
 */
export function describeSchemaState(
  state: SchemaState,
  audience: 'local' | 'deployment' = 'local',
): string | null {
  if (state.ok) return null;
  if (state.reason === 'uninitialized')
    return audience === 'local'
      ? 'This database has no schema yet. Run pnpm local:setup to create it.'
      : 'This database has no schema yet. Run docker compose run --rm migrate to create it.';
  if (state.reason === 'changed')
    return `These migrations were edited after they were applied: ${state.changed.join(', ')}. The database and this build have diverged; restore the original files or rebuild the database from a backup.`;
  return `This database is missing ${state.pending.length} migration${
    state.pending.length === 1 ? '' : 's'
  } (${state.pending.join(', ')}). Run ${audience === 'local' ? 'pnpm local:migrate' : './upgrade.sh'}, then start again.`;
}

/**
 * A warning worth logging even though the database is serveable: it has
 * migrations this build has never heard of. Usually a process that has been
 * running since before the last deploy, which will fail on whatever the newer
 * schema changed rather than on anything it can name.
 */
export function describeSchemaDrift(state: SchemaState): string | null {
  if (!state.ok || !state.ahead.length) return null;
  return `This database has ${state.ahead.length} migration${
    state.ahead.length === 1 ? '' : 's'
  } this build does not know about (${state.ahead.join(', ')}). The application is older than the schema it is using; restart it on the current build.`;
}
