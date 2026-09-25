import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { passdownVersion } from '@guide/contracts';
import { afterEach, describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const script = join(root, 'scripts', 'check-release-version.mjs');
const run = (...args: string[]) =>
  spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('release version check', () => {
  it('accepts only the tag that names the source version', () => {
    const accepted = run('--tag', `v${passdownVersion}`);
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(accepted.stdout.trim()).toBe(passdownVersion);
    expect(run().status).toBe(0);
    for (const tag of [passdownVersion, `v${passdownVersion}-1`, 'v0.0.1', 'latest']) {
      const refused = run('--tag', tag);
      expect(refused.status, tag).toBe(1);
      expect(refused.stdout).toBe('');
    }
  });

  it('refuses a package that names another version', () => {
    const copy = mkdtempSync(join(tmpdir(), 'passdown-version-'));
    directories.push(copy);
    for (const path of ['package.json', 'deploy', 'packages', 'apps'])
      cpSync(join(root, path), join(copy, path), {
        recursive: true,
        filter: (source) => !source.includes('node_modules') && !source.includes('.next'),
      });
    expect(run('--root', copy).status).toBe(0);
    writeFileSync(join(copy, 'packages/ui/package.json'), '{"version":"0.0.9"}\n');
    const refused = run('--root', copy, '--tag', `v${passdownVersion}`);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/packages\/ui\/package\.json names 0\.0\.9/);
  });
});
