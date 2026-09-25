import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { passdownVersion } from '@guide/contracts';
import { afterEach, describe, expect, it } from 'vitest';
import {
  composeProblems,
  releaseAssetProblems,
  renderCompose,
  renderReleaseAssets,
} from './render-release-assets.mjs';

const root = join(__dirname, '..');
const script = join(root, 'scripts', 'render-release-assets.mjs');
const version = passdownVersion;
const digests = {
  passdown: `sha256:${'a'.repeat(64)}`,
  'passdown-caddy': `sha256:${'b'.repeat(64)}`,
  'passdown-nginx': `sha256:${'c'.repeat(64)}`,
};
const pinned = (name: keyof typeof digests) => `ghcr.io/nanwer/${name}:${version}@${digests[name]}`;
const directories: string[] = [];
const temporary = () => {
  const dir = mkdtempSync(join(tmpdir(), 'passdown-assets-'));
  directories.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('release assets', () => {
  it('pins every Passdown image in the shipped compose files to its release digest', () => {
    const output = join(temporary(), 'assets');
    renderReleaseAssets({ source: join(root, 'deploy'), output, version, digests });
    expect(readdirSync(output).sort()).toEqual([
      'SHA256SUMS',
      'backup.sh',
      'compose.nginx.yaml',
      'compose.yaml',
      'init.sh',
      'upgrade.sh',
    ]);
    const compose = readFileSync(join(output, 'compose.yaml'), 'utf8');
    const nginx = readFileSync(join(output, 'compose.nginx.yaml'), 'utf8');
    // The override stays: upgrade.sh --image and the smoke run rely on it.
    expect(compose).toContain(`image: \${PASSDOWN_IMAGE:-${pinned('passdown')}}`);
    expect(compose).toContain(`image: \${PASSDOWN_PROXY_IMAGE:-${pinned('passdown-caddy')}}`);
    expect(nginx).toContain(`image: \${PASSDOWN_PROXY_IMAGE:-${pinned('passdown-nginx')}}`);
    expect(compose).not.toMatch(/Development candidate|init\.sh --build/);
    expect(composeProblems(compose, { version })).toEqual([]);
    expect(composeProblems(nginx, { version })).toEqual([]);
    for (const file of ['init.sh', 'upgrade.sh', 'backup.sh'])
      expect(readFileSync(join(output, file), 'utf8')).toBe(
        readFileSync(join(root, 'deploy', file), 'utf8'),
      );
    const sums = readFileSync(join(output, 'SHA256SUMS'), 'utf8');
    expect(sums).toBe(
      ['backup.sh', 'compose.nginx.yaml', 'compose.yaml', 'init.sh', 'upgrade.sh']
        .map((file) => `${sha256(join(output, file))}  ${file}\n`)
        .join(''),
    );
    expect(releaseAssetProblems(output, { version })).toEqual([]);
  });

  it('refuses to render without a well-formed digest for every image', () => {
    const { 'passdown-nginx': _missing, ...partial } = digests;
    expect(() =>
      renderReleaseAssets({
        source: join(root, 'deploy'),
        output: join(temporary(), 'a'),
        version,
        digests: partial,
      }),
    ).toThrow(/passdown-nginx/);
    expect(() =>
      renderReleaseAssets({
        source: join(root, 'deploy'),
        output: join(temporary(), 'b'),
        version,
        digests: { ...digests, passdown: 'sha256:abc' },
      }),
    ).toThrow(/digest/i);
  });

  it('refuses a source file whose image tag is not the release version', () => {
    const text = 'services:\n  web:\n    image: ${PASSDOWN_IMAGE:-ghcr.io/nanwer/passdown:0.0.9}\n';
    expect(() => renderCompose(text, { version, digests })).toThrow(/0\.0\.9/);
  });

  it('reports unpinned, untagged, unresolved and buildable services', () => {
    const problems = (image: string, extra = '') =>
      composeProblems(`services:\n  web:\n    image: ${image}\n${extra}`, { version });
    expect(problems(pinned('passdown'))).toEqual([]);
    expect(problems(`\${PASSDOWN_IMAGE:-${pinned('passdown')}}`)).toEqual([]);
    expect(problems(`ghcr.io/nanwer/passdown:${version}`)).not.toEqual([]);
    expect(problems(`\${PASSDOWN_IMAGE:-ghcr.io/nanwer/passdown:${version}}`)).not.toEqual([]);
    expect(problems('postgres:17-alpine')).not.toEqual([]);
    expect(problems(`postgres:17-alpine@sha256:${'d'.repeat(64)}`)).toEqual([]);
    expect(problems(`ghcr.io/nanwer/passdown:0.0.9@${digests.passdown}`)).not.toEqual([]);
    expect(problems(`ghcr.io/nanwer/passdown@${digests.passdown}`)).not.toEqual([]);
    expect(problems('${PASSDOWN_IMAGE}')).not.toEqual([]);
    expect(problems(pinned('passdown'), '    build: { context: .. }\n')).not.toEqual([]);
    expect(composeProblems('services:\n  web: { build: . }\n', { version })).not.toEqual([]);
    expect(composeProblems('services: {}\n', { version })).not.toEqual([]);
  });

  it('notices a changed, missing or unexpected file after rendering', () => {
    const output = join(temporary(), 'assets');
    renderReleaseAssets({ source: join(root, 'deploy'), output, version, digests });
    appendFileSync(join(output, 'init.sh'), '\n# changed\n');
    expect(releaseAssetProblems(output, { version }).join('\n')).toMatch(/init\.sh/);

    const second = join(temporary(), 'assets');
    renderReleaseAssets({ source: join(root, 'deploy'), output: second, version, digests });
    writeFileSync(join(second, '.env'), 'SECRET=1\n');
    expect(releaseAssetProblems(second, { version }).join('\n')).toMatch(/\.env/);

    const third = join(temporary(), 'assets');
    renderReleaseAssets({ source: join(root, 'deploy'), output: third, version, digests });
    rmSync(join(third, 'backup.sh'));
    expect(releaseAssetProblems(third, { version }).join('\n')).toMatch(/backup\.sh/);
  });

  it('never writes into a directory that already holds files', () => {
    const output = temporary();
    mkdirSync(join(output, 'keep'));
    expect(() =>
      renderReleaseAssets({ source: join(root, 'deploy'), output, version, digests }),
    ).toThrow(/empty/);
    expect(readdirSync(output)).toEqual(['keep']);
  });

  it('renders and checks from the command line, failing on an unpinned file', () => {
    const output = join(temporary(), 'assets');
    const args = ['--version', version, '--output', output];
    for (const [name, digest] of Object.entries(digests))
      args.push('--digest', `${name}=${digest}`);
    const rendered = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    expect(rendered.status, rendered.stderr).toBe(0);
    expect(rendered.stdout).toContain(pinned('passdown-nginx'));
    const check = () =>
      spawnSync(process.execPath, [script, '--check', output, '--version', version], {
        encoding: 'utf8',
      });
    expect(check().status).toBe(0);
    const compose = join(output, 'compose.nginx.yaml');
    writeFileSync(
      compose,
      readFileSync(compose, 'utf8').replace(`@${digests['passdown-nginx']}`, ''),
    );
    const refused = check();
    expect(refused.status).toBe(1);
    expect(refused.stderr).toMatch(/compose\.nginx\.yaml/);
  });
});
