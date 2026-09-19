import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export function readConfig() {
  if (!existsSync(root + '.env.local'))
    throw new Error('Local database is not configured. Run pnpm local:setup.');
  return Object.fromEntries(
    readFileSync(root + '.env.local', 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}
export function initializeConfig() {
  if (existsSync(root + '.env.local')) return readConfig();
  const owner = randomBytes(32).toString('hex'),
    runtime = randomBytes(32).toString('hex');
  const config = {
    GUIDE_DB_OWNER_PASSWORD: owner,
    GUIDE_OWNER_DATABASE_URL: `postgresql://guide_owner:${owner}@127.0.0.1:55439/guide_app`,
    GUIDE_DATABASE_URL: `postgresql://guide_runtime:${runtime}@127.0.0.1:55439/guide_app`,
    BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
    BETTER_AUTH_URL: 'http://127.0.0.1:3100',
    GUIDE_LOCAL_OWNER_EMAIL: 'owner@guide.local',
    GUIDE_LOCAL_OWNER_PASSWORD: randomBytes(24).toString('base64url'),
  };
  writeFileSync(
    root + '.env.local',
    Object.entries(config)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
    { mode: 0o600, flag: 'wx' },
  );
  return config;
}
export function writeAccess(config) {
  const web =
    ['GUIDE_DATABASE_URL', 'BETTER_AUTH_SECRET', 'BETTER_AUTH_URL']
      .map((k) => `${k}=${config[k]}`)
      .join('\n') + '\n';
  writeFileSync(root + 'apps/web/.env.local', web, { mode: 0o600 });
  chmodSync(root + 'apps/web/.env.local', 0o600);
  writeFileSync(
    root + 'LOCAL_ACCESS.md',
    `# Local authoring access\n\nOpen ${config.BETTER_AUTH_URL}/sign-in\n\nEmail: ${config.GUIDE_LOCAL_OWNER_EMAIL || 'owner@guide.local'}\nPassword: ${config.GUIDE_LOCAL_OWNER_PASSWORD}\n\nKeep this file private. This verified local account owns Repair collective and Workshop.\n\nStart: pnpm dev\nDatabase: pnpm local:up\nStop database safely: pnpm local:down\nRepeat pnpm local:setup without deleting data. Never use Docker down -v for routine shutdown.\n`,
    { mode: 0o600 },
  );
  chmodSync(root + 'LOCAL_ACCESS.md', 0o600);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initializeConfig();
  console.log('Local configuration ready; secrets stored in .env.local (0600).');
}
