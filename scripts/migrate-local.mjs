import { applyMigrations, readMigrationDirectory } from '../packages/database/src/migrator.ts';
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
  await applyMigrations({
    ownerURL: connectionString,
    runtimeURL,
    migrations: readMigrationDirectory(root + 'packages/database/migrations'),
    policy: 'loopback',
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const c = readConfig();
  await migrate(c.GUIDE_OWNER_DATABASE_URL, c.GUIDE_DATABASE_URL);
  console.log('Versioned local database migrations applied.');
}
