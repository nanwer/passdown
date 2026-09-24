import { spawnSync } from 'node:child_process';
// A new server and empty disposable database for each engine: setup completion is permanent.
for (const browser of ['chromium', 'firefox', 'webkit']) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--config', 'playwright.setup.config.ts'],
    { stdio: 'inherit', env: { ...process.env, SETUP_BROWSER: browser } },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
