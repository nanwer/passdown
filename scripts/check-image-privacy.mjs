import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'passdown-image-privacy-'));
const checker = resolve('scripts/check-image-files.mjs');
const fixtures = [
  'apps/web/AGENTS.md',
  'apps/web/CLAUDE.md',
  'apps/web/private-note.md',
  'apps/web/lib/media.test.ts',
  'apps/web/components/secret.test.tsx',
  'apps/web/.passdown-settings.123',
  'deploy/custom.env',
  'deploy/.env.production',
  'deploy/.env.renew-lock',
  'apps/web/.private/report.txt',
];
const contextFixtures = [...fixtures, 'apps/web/credentials.txt'];
try {
  for (const file of contextFixtures) {
    mkdirSync(join(directory, file, '..'), { recursive: true });
    writeFileSync(join(directory, file), 'synthetic-private-marker');
  }
  if (process.argv.includes('--context')) {
    writeFileSync(join(directory, '.dockerignore'), readFileSync('.dockerignore'));
    writeFileSync(join(directory, 'Dockerfile'), 'FROM scratch\nCOPY . /\n');
    mkdirSync(join(directory, 'packages/core/src'), { recursive: true });
    writeFileSync(join(directory, 'packages/core/src/index.ts'), 'export {};');
    writeFileSync(join(directory, 'apps/web/lib/media.ts'), 'export {};');
    writeFileSync(join(directory, 'package.json'), '{}');
    const destination = mkdtempSync(join(tmpdir(), 'passdown-image-context-'));
    try {
      const built = spawnSync(
        'docker',
        ['build', '--output', `type=local,dest=${destination}`, directory],
        { encoding: 'utf8' },
      );
      assert.equal(built.status, 0, 'Disposable Docker context probe must build.');
      for (const file of contextFixtures)
        assert.equal(
          existsSync(join(destination, file)),
          false,
          `Private notes, settings and tests must not enter the Docker context: ${file}`,
        );
      for (const file of ['apps/web/lib/media.ts', 'packages/core/src/index.ts', 'package.json'])
        assert.equal(
          existsSync(join(destination, file)),
          true,
          'Required build input was excluded.',
        );
    } finally {
      rmSync(destination, { recursive: true, force: true });
    }
  } else {
    for (const file of fixtures.concat([
      'node_modules/dependency/index.d.ts',
      'node_modules/dependency/README.md',
    ])) {
      const root = mkdtempSync(join(tmpdir(), 'passdown-image-files-'));
      try {
        mkdirSync(join(root, file, '..'), { recursive: true });
        writeFileSync(join(root, file), 'synthetic-private-marker');
        const checked = spawnSync(process.execPath, [checker, root], { encoding: 'utf8' });
        assert.equal(
          checked.status,
          1,
          'Runtime file guard must reject source, tests, notes and settings.',
        );
        assert.match(
          checked.stderr,
          /Unexpected file/,
          'Guard must reject the fixture rather than fail to start.',
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }
    const authored = mkdtempSync(join(tmpdir(), 'passdown-image-authored-'));
    try {
      writeFileSync(join(authored, 'private-note.md'), 'synthetic-private-marker');
      assert.equal(
        spawnSync(process.execPath, [checker, authored, '--prune-metadata']).status,
        1,
        'Pruning dependency metadata must still refuse an authored working note.',
      );
      assert.equal(
        existsSync(join(authored, 'private-note.md')),
        true,
        'A privacy failure must remain visible rather than be silently removed.',
      );
    } finally {
      rmSync(authored, { recursive: true, force: true });
    }
    const clean = mkdtempSync(join(tmpdir(), 'passdown-image-clean-'));
    try {
      for (const file of [
        'LICENSE',
        'THIRD_PARTY_NOTICES.md',
        'node_modules/dependency/LICENSE.md',
        'node_modules/dependency/NOTICE.md',
        'apps/web/server.js',
      ]) {
        mkdirSync(join(clean, file, '..'), { recursive: true });
        writeFileSync(join(clean, file), 'retained runtime or notice');
      }
      assert.equal(
        spawnSync(process.execPath, [checker, clean]).status,
        0,
        'Runtime files and legal notices must be retained.',
      );
    } finally {
      rmSync(clean, { recursive: true, force: true });
    }
  }
  console.log('Image privacy regression checks passed.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
