import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { readConfig } from './local-config.mjs';
import { migrate } from './migrate-local.mjs';
import { seedLocal } from './seed-local';
const source = readConfig();
// Uploads from browser runs are as disposable as the rows that reference them.
const mediaRoot = join(process.cwd(), '.media-authoring');
const owner = new URL(source.GUIDE_OWNER_DATABASE_URL!);
const runtime = new URL(source.GUIDE_DATABASE_URL!);
// Only the dedicated disposable browser-test database is initialized here.
owner.pathname = '/guide_app_e2e';
runtime.pathname = '/guide_app_e2e';
const client = new pg.Client({ connectionString: source.GUIDE_OWNER_DATABASE_URL });
await client.connect();
try {
  if (!(await client.query("SELECT 1 FROM pg_database WHERE datname='guide_app_e2e'")).rowCount)
    await client.query('CREATE DATABASE guide_app_e2e');
} finally {
  await client.end();
}
const config = {
  ...source,
  GUIDE_OWNER_DATABASE_URL: owner.href,
  GUIDE_DATABASE_URL: runtime.href,
  BETTER_AUTH_URL: 'http://127.0.0.1:3101',
};
await migrate(config.GUIDE_OWNER_DATABASE_URL, config.GUIDE_DATABASE_URL);

/**
 * Make the database disposable in fact, not only in intent.
 *
 * Every browser run creates guides, categories, catalog items and uploads.
 * Without this they accumulate across runs until an assertion about how many
 * results a search returns stops meaning anything — which is how a genuine
 * regression would hide. Tables are discovered rather than listed, so a new
 * one is covered the day it is added.
 */
const reset = new pg.Client({ connectionString: config.GUIDE_OWNER_DATABASE_URL });
await reset.connect();
try {
  const tables = (
    await reset.query(
      `SELECT format('%I.%I', schemaname, tablename) AS name FROM pg_tables
       WHERE schemaname='app' OR (schemaname='public' AND tablename LIKE 'auth\\_%')`,
    )
  ).rows.map((row) => row.name as string);
  // schema_migration is deliberately left alone: the schema stays, the data goes.
  if (tables.length) await reset.query(`TRUNCATE ${tables.join(',')} CASCADE`);
} finally {
  await reset.end();
}
await rm(mediaRoot, { recursive: true, force: true });

await seedLocal(config);
// Operator credentials never enter the web process environment.
const env = { ...process.env };
for (const key of Object.keys(env))
  if (key.startsWith('GUIDE_') || key.startsWith('BETTER_AUTH_')) delete env[key];
Object.assign(env, {
  GUIDE_DATABASE_URL: runtime.href,
  BETTER_AUTH_SECRET: source.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: config.BETTER_AUTH_URL,
  GUIDE_NEXT_DIST_DIR: '.next-authoring',
  GUIDE_MEDIA_ROOT: mediaRoot,
  GUIDE_DEMO_PREVIEW: '1',
  NEXT_TELEMETRY_DISABLED: '1',
});
const child = spawn(
  'pnpm',
  ['--filter', '@guide/web', 'exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', '3101'],
  { stdio: 'inherit', env },
);
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 1));
