import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildInfo, passdownVersion } from './build-info';

const root = join(__dirname, '..', '..', '..');
const version = (path: string) =>
  (JSON.parse(readFileSync(join(root, path), 'utf8')) as { version: string }).version;

describe('build information', () => {
  it('names the same version as every package', () => {
    const packages = ['apps', 'packages'].flatMap((group) =>
      readdirSync(join(root, group)).map((name) => `${group}/${name}/package.json`),
    );
    expect(packages.length).toBeGreaterThan(8);
    for (const path of ['package.json', ...packages])
      expect(version(path), path).toBe(passdownVersion);
  });
  it('reports a source revision only when it is a real commit identifier', () => {
    const sha = 'aeb95530846d9c52c5fb22feae69187dd0e9c5bf';
    expect(buildInfo({ PASSDOWN_REVISION: sha })).toEqual({
      version: passdownVersion,
      revision: sha,
    });
    for (const value of [undefined, '', 'unknown', 'main', 'abc', `${sha}; rm -rf /`])
      expect(buildInfo({ PASSDOWN_REVISION: value }).revision).toBeNull();
  });
});
