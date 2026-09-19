import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it.each([
  ['packages/ui/src/bad.ts', "import { Pool } from 'pg';"],
  ['apps/web/lib/bad.ts', "import { Pool } from 'pg';"],
  ['packages/contracts/src/bad.ts', "import { betterAuth } from 'better-auth';"],
  ['apps/web/components/bad.ts', "'use client'; import { store } from '@guide/database';"],
  ['packages/ui/src/bad.js', "import { Pool } from 'pg';"],
  ['packages/core/src/bad.ts', "export { default } from 'next/link';"],
  ['packages/guide-ui/src/bad.ts', "import('@guide/core');"],
  ['packages/ui/src/bad.ts', "import { secret } from '../../core/src/internal';"],
  ['packages/core/src/bad.ts', "import '@guide/content/src/internal';"],
])('rejects a forbidden dependency in %s', (file, source) => {
  const root = mkdtempSync(join(tmpdir(), 'guide-boundary-'));
  try {
    const path = join(root, file);
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, source);
    const result = spawnSync(process.execPath, ['scripts/check-boundaries.mjs', root], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/forbidden|cannot import|cross-package|deep package/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('allows database infrastructure behind a server entry and framework-free contracts', () => {
  const root = mkdtempSync(join(tmpdir(), 'guide-boundary-'));
  try {
    for (const [file, source] of Object.entries({
      'apps/web/lib/store.ts': "import { store } from '@guide/database';",
      'packages/database/src/store.ts':
        "import { Pool } from 'pg'; import { drizzle } from 'drizzle-orm/node-postgres'; import { betterAuth } from 'better-auth'; import type { Actor } from '@guide/core'; import { schema } from '@guide/contracts';",
      'packages/contracts/src/index.ts': "import { document } from '@guide/content';",
    })) {
      const path = join(root, file);
      mkdirSync(resolve(path, '..'), { recursive: true });
      writeFileSync(path, source);
    }
    const result = spawnSync(process.execPath, ['scripts/check-boundaries.mjs', root], {
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
