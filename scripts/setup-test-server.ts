import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { readConfig } from './local-config.mjs';
import { migrate, requireLocal } from './migrate-local.mjs';
const source = readConfig();
const owner = new URL(source.GUIDE_OWNER_DATABASE_URL);
const runtime = new URL(source.GUIDE_DATABASE_URL);
owner.pathname = runtime.pathname = '/guide_app_setup_e2e';
requireLocal(owner.href, 'guide_app_setup_e2e');
const adminURL = new URL(owner);
adminURL.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminURL.href });
await admin.connect();
try {
  await admin.query('DROP DATABASE IF EXISTS guide_app_setup_e2e WITH (FORCE)');
  await admin.query('CREATE DATABASE guide_app_setup_e2e');
} finally {
  await admin.end();
}
await migrate(owner.href, runtime.href);
const env = { ...process.env };
for (const key of Object.keys(env))
  if (/^(GUIDE_|BETTER_AUTH_|PASSDOWN_)/.test(key)) delete env[key];
Object.assign(env, {
  GUIDE_DATABASE_URL: runtime.href,
  BETTER_AUTH_SECRET: 'synthetic-setup-browser-secret-32-characters',
  BETTER_AUTH_URL: 'http://127.0.0.1:3106',
  PASSDOWN_SETUP_CODE_SHA256: createHash('sha256').update('1234567890ABCDEFGHJK').digest('hex'),
  GUIDE_NEXT_DIST_DIR: '.next-setup',
  NEXT_TELEMETRY_DISABLED: '1',
});
const child = spawn(
  'pnpm',
  ['--filter', '@guide/web', 'exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', '3106'],
  { stdio: 'inherit', env },
);
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
child.on('exit', (code) => process.exit(code ?? 1));
