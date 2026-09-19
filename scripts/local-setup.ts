import { spawnSync } from 'node:child_process';
import { initializeConfig, writeAccess, root } from './local-config.mjs';
import { migrate, requireLocal } from './migrate-local.mjs';
import { seedLocal } from './seed-local';
const config = initializeConfig();
requireLocal(config.GUIDE_OWNER_DATABASE_URL!, 'guide_app');
requireLocal(config.GUIDE_DATABASE_URL!, 'guide_app');
const docker = spawnSync(
  'docker',
  ['compose', '--env-file', '.env.local', '-f', 'compose.app.yaml', 'up', '-d', '--wait'],
  { cwd: root, stdio: 'inherit' },
);
if (docker.status !== 0)
  throw new Error('Local PostgreSQL did not start. Open Docker and rerun pnpm local:setup.');
await migrate(config.GUIDE_OWNER_DATABASE_URL!, config.GUIDE_DATABASE_URL!);
await seedLocal(config);
writeAccess(config);
console.log(
  'Local authoring is ready. Open LOCAL_ACCESS.md for the private login and pnpm dev to start. Existing guides and credentials were preserved.',
);
