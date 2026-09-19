import pg from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readConfig, root } from './local-config.mjs';
export function requireLocal(url, database) {
  const parsed = new URL(url);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname) ||
    !['postgres:', 'postgresql:'].includes(parsed.protocol)
  )
    throw new Error('Database must be loopback PostgreSQL');
  if (database && parsed.pathname !== `/${database}`)
    throw new Error(`Expected dedicated ${database} database`);
  return parsed;
}
export async function migrate(connectionString, runtimeURL) {
  requireLocal(connectionString);
  const runtime = requireLocal(runtimeURL);
  if (runtime.username !== 'guide_runtime') throw new Error('Expected guide_runtime runtime role');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(719821005)');
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname='guide_runtime'");
    if (!exists.rowCount) {
      const password = decodeURIComponent(runtime.password).replaceAll("'", "''");
      await client.query(
        `CREATE ROLE guide_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${password}'`,
      );
    }
    await client.query(
      'CREATE TABLE IF NOT EXISTS public.schema_migration(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    // The runtime role reads this to confirm the database matches the build it
    // is serving. Read-only, and metadata only: it grants nothing over content,
    // and the runtime still cannot apply or record a migration.
    await client.query('GRANT SELECT ON public.schema_migration TO guide_runtime');
    for (const name of readdirSync(root + 'packages/database/migrations')
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      const sql = readFileSync(root + 'packages/database/migrations/' + name, 'utf8'),
        checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query(
        'SELECT checksum FROM public.schema_migration WHERE name=$1',
        [name],
      );
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum)
          throw new Error('Applied migration changed: ' + name);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO public.schema_migration(name,checksum) VALUES($1,$2)', [
          name,
          checksum,
        ]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
  } finally {
    await client.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const c = readConfig();
  await migrate(c.GUIDE_OWNER_DATABASE_URL, c.GUIDE_DATABASE_URL);
  console.log('Versioned local database migrations applied.');
}
