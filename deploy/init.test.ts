import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

const script = resolve('deploy/init.sh');
const directories: string[] = [];
const defaultDockerDir = mkdtempSync(join(tmpdir(), 'passdown-init-docker-'));
writeFileSync(
  join(defaultDockerDir, 'docker'),
  `#!/bin/sh
if [ -n "$INIT_DOCKER_LOG" ]; then printf '%s\\n' "$@" >> "$INIT_DOCKER_LOG"; fi
[ "$INIT_DOCKER_FAIL" != 1 ] || exit 1
case "$1 $2" in
  'volume ls') printf '%s\\n' "$INIT_VOLUME_NAMES" ;;
  'container ls') printf '%s\\n' "$INIT_CONTAINER_IDS" ;;
  *) exit 1 ;;
esac
`,
  { mode: 0o700 },
);
const defaultPath = `${defaultDockerDir}:${process.env.PATH}`;
afterAll(() => rmSync(defaultDockerDir, { recursive: true, force: true }));
function directory() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'passdown-init-')));
  directories.push(dir);
  return dir;
}
function run(dir: string, args: string[] = [], env: Partial<NodeJS.ProcessEnv> = {}) {
  return spawnSync('sh', [script, ...args], {
    cwd: dir,
    env: { ...process.env, PATH: defaultPath, ...env },
    encoding: 'utf8',
  });
}
function settings(dir: string) {
  return readFileSync(join(dir, '.env'), 'utf8');
}
function code(stdout: string) {
  const match = stdout.match(/Setup code:\s+([0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3})/g);
  expect(match).toHaveLength(1);
  return match![0].replace(/Setup code:\s+/, '');
}
function files(dir: string): string {
  return readdirSync(dir, { withFileTypes: true })
    .map((entry) =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : readFileSync(join(dir, entry.name), 'utf8'),
    )
    .join('\n');
}
function docker(dir: string, state: string, status = 0) {
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh\nprintf '%s\\n' "$PWD" "$@" > "$DOCKER_ARGUMENT_LOG"\nprintf '%s\\n' '${state}'\nexit ${status}\n`,
    { mode: 0o700 },
  );
  return { PATH: `${bin}:${process.env.PATH}`, DOCKER_ARGUMENT_LOG: join(dir, 'docker-arguments') };
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('installation settings', () => {
  it('isolates directories and custom settings files while keeping a lost-file project identity stable', () => {
    const first = directory();
    const second = directory();
    const project = (path: string) =>
      readFileSync(path, 'utf8').match(/^COMPOSE_PROJECT_NAME=(.+)$/m)![1];
    expect(run(first, ['--domain', 'localhost']).status).toBe(0);
    expect(run(second, ['--domain', 'localhost']).status).toBe(0);
    expect(run(first, ['--domain', 'localhost', '--output', 'second.env']).status).toBe(0);
    const original = project(join(first, '.env'));
    expect(
      new Set([original, project(join(second, '.env')), project(join(first, 'second.env'))]).size,
    ).toBe(3);
    rmSync(join(first, '.env'));
    expect(run(first, ['--domain', 'localhost']).status).toBe(0);
    expect(project(join(first, '.env'))).toBe(original);
  });

  it('stores an explicit project and preserves it during renewal', () => {
    const dir = directory();
    expect(run(dir, ['--domain', 'localhost', '--project', 'passdown-evaluation']).status).toBe(0);
    expect(settings(dir)).toContain('COMPOSE_PROJECT_NAME=passdown-evaluation\n');
    const result = run(dir, ['--renew-setup-code'], docker(dir, 'required'));
    expect(result.status).toBe(0);
    expect(settings(dir)).toContain('COMPOSE_PROJECT_NAME=passdown-evaluation\n');
    expect(readFileSync(join(dir, 'docker-arguments'), 'utf8')).toContain(
      '--project-name\npassdown-evaluation\n',
    );
    expect(result.stdout).toContain("--project-name 'passdown-evaluation'");
  });

  it.each(['saved-project_database', 'saved-project_media', 'other-labelled-volume'])(
    'refuses an existing project volume %s without replacing lost settings',
    (volume) => {
      const dir = directory();
      const result = run(dir, ['--domain', 'localhost', '--project', 'saved-project'], {
        INIT_VOLUME_NAMES: volume,
      });
      expect(result.status).toBe(4);
      expect(readdirSync(dir)).toEqual([]);
      expect(result.stdout).not.toContain('Setup code:');
      expect(result.stderr).toContain('already has Docker resources');
    },
  );

  it('refuses an existing project container even without volumes', () => {
    const dir = directory();
    expect(
      run(dir, ['--domain', 'localhost', '--project', 'saved-project'], {
        INIT_CONTAINER_IDS: 'fixture-container',
      }).status,
    ).toBe(4);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('checks Docker state for the derived default after the settings file is lost', () => {
    const dir = directory();
    expect(run(dir, ['--domain', 'localhost']).status).toBe(0);
    const project = settings(dir).match(/^COMPOSE_PROJECT_NAME=(.+)$/m)![1];
    rmSync(join(dir, '.env'));
    const log = join(directory(), 'docker.log');
    const result = run(dir, ['--domain', 'localhost'], {
      INIT_VOLUME_NAMES: `${project}_database`,
      INIT_DOCKER_LOG: log,
    });
    expect(result.status).toBe(4);
    expect(readFileSync(log, 'utf8')).toContain(`label=com.docker.compose.project=${project}`);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('fails closed when the Docker inventory cannot be read', () => {
    const dir = directory();
    const result = run(dir, ['--domain', 'localhost'], { INIT_DOCKER_FAIL: '1' });
    expect(result.status).toBe(1);
    expect(readdirSync(dir)).toEqual([]);
    expect(result.stdout).not.toContain('Setup code:');
  });

  it.each(['Uppercase', '../other', '-prefix', 'space name', 'x'.repeat(64)])(
    'rejects invalid explicit project %s',
    (project) => {
      const dir = directory();
      expect(run(dir, ['--domain', 'localhost', '--project', project]).status).toBe(2);
      expect(readdirSync(dir)).toEqual([]);
    },
  );

  it.each(['credentials.txt', '.env.example'])(
    'requires an ignored settings filename instead of %s',
    (output) => {
      const dir = directory();
      expect(run(dir, ['--domain', 'localhost', '--output', output]).status).toBe(2);
      expect(readdirSync(dir)).toEqual([]);
    },
  );

  it('creates private settings with independent secrets and a printed-once, hash-only Crockford setup code', () => {
    const dir = directory();
    const result = run(dir, [
      '--domain',
      'guides.example.org',
      '--acme-email',
      'operator@example.org',
    ]);
    expect(result.status).toBe(0);
    const value = settings(dir);
    expect(statSync(join(dir, '.env')).mode & 0o777).toBe(0o600);
    for (const [key, length] of [
      ['GUIDE_DB_OWNER_PASSWORD', 64],
      ['GUIDE_DB_RUNTIME_PASSWORD', 64],
      ['BETTER_AUTH_SECRET', 96],
    ] as const) {
      expect(value).toMatch(new RegExp(`^${key}=[0-9a-f]{${length}}$`, 'm'));
    }
    expect(value).toContain('BETTER_AUTH_URL=https://guides.example.org\n');
    expect(value).toContain('PASSDOWN_TLS=operator@example.org\n');
    expect(value).toMatch(/^COMPOSE_PROJECT_NAME=passdown-[0-9a-f]{20}$/m);
    const printed = code(result.stdout);
    const normal = printed.replaceAll('-', '');
    expect(value).toContain(
      `PASSDOWN_SETUP_CODE_SHA256=${createHash('sha256').update(normal).digest('hex')}\n`,
    );
    expect(files(dir)).not.toContain(printed);
    expect(files(dir)).not.toContain(normal);
    expect(result.stderr).toBe('');
    const another = run(directory(), ['--domain', 'localhost']);
    expect(another.status).toBe(0);
    expect(code(another.stdout)).not.toBe(printed);
  });

  it('supports explicit internal certificates, custom ports, output path and source builds', () => {
    const dir = directory();
    const result = run(dir, [
      '--domain',
      'guides.example.org',
      '--internal-tls',
      '--http-port',
      '8080',
      '--https-port',
      '8443',
      '--build',
      '--output',
      'settings.env',
    ]);
    expect(result.status).toBe(0);
    const value = readFileSync(join(dir, 'settings.env'), 'utf8');
    expect(value).toContain('PASSDOWN_TLS=internal\n');
    expect(value).toContain('BETTER_AUTH_URL=https://guides.example.org:8443\n');
    expect(value).toContain('PASSDOWN_HTTP_PORT=8080\n');
    expect(value).toContain('COMPOSE_FILE=compose.yaml:compose.build.yaml\n');
    expect(value).toContain('PASSDOWN_IMAGE=passdown:local\n');
    expect(value).toContain('PASSDOWN_PROXY_IMAGE=passdown-caddy:local\n');
    expect(result.stdout).toContain('--env-file');
    expect(result.stdout).toContain('settings.env');
  });

  it('sets localhost certificates and HSTS appropriately', () => {
    const dir = directory();
    expect(run(dir, ['--domain', 'localhost']).status).toBe(0);
    expect(settings(dir)).toContain('PASSDOWN_TLS=internal\n');
    expect(settings(dir)).toContain('PASSDOWN_HSTS_MAX_AGE=0\n');
  });

  it.each([
    [[], 2],
    [['--domain'], 2],
    [['--domain', 'https://example.org'], 2],
    [['--domain', 'example.org/path'], 2],
    [['--domain', 'bad..example.org'], 2],
    [['--domain', '-bad.example.org'], 2],
    [['--domain', 'example.org'], 3],
    [['--domain', 'localhost', '--http-port', '0'], 2],
    [['--domain', 'localhost', '--https-port', '65536'], 2],
    [['--domain', 'localhost', '--http-port', '443'], 2],
    [['--domain', 'example.org', '--acme-email', 'not-email'], 2],
    [['--domain', 'example.org', '--acme-email', 'a@example.org', '--internal-tls'], 2],
    [['--domain', 'localhost', '--proxy', 'nginx'], 3],
    [['--domain', 'localhost', '--tls-dir', './certificates'], 3],
  ])('rejects invalid or unsupported input %j', (args, status) => {
    const dir = directory();
    const result = run(dir, args as string[]);
    expect(result.status).toBe(status);
    expect(readdirSync(dir)).toEqual([]);
    expect(result.stdout).not.toContain('Setup code:');
  });

  it('refuses overwriting existing files, directories, and dangling symlinks', () => {
    for (const type of ['file', 'directory', 'symlink']) {
      const dir = directory();
      const target = join(dir, '.env');
      if (type === 'file') writeFileSync(target, 'keep this');
      else if (type === 'directory') mkdirSync(target);
      else symlinkSync(join(dir, 'missing'), target);
      expect(run(dir, ['--domain', 'localhost']).status).toBe(1);
      if (type === 'file') expect(settings(dir)).toBe('keep this');
      expect(readdirSync(dir)).toEqual(['.env']);
    }
  });

  it('allows only one initializer to claim the output', () => {
    const dir = directory();
    // Run two independent processes together; no shell output contains a secret.
    const command =
      'sh "$INIT_SCRIPT" --domain localhost >first.log 2>first.err & first=$!; sh "$INIT_SCRIPT" --domain localhost >second.log 2>second.err & second=$!; wait "$first"; a=$?; wait "$second"; b=$?; printf "%s %s" "$a" "$b"';
    const statuses = execFileSync('sh', ['-c', command], {
      cwd: dir,
      env: { ...process.env, PATH: defaultPath, INIT_SCRIPT: script },
      encoding: 'utf8',
    });
    expect(statuses.split(' ').sort()).toEqual(['0', '1']);
    expect(statSync(join(dir, '.env')).mode & 0o777).toBe(0o600);
  });

  it('renews only the hash, using the selected installation and not ambient compose settings', () => {
    const dir = directory();
    expect(run(dir, ['--domain', 'localhost', '--build']).status).toBe(0);
    const before = settings(dir);
    const elsewhere = directory();
    const result = run(elsewhere, ['--renew-setup-code', '--output', join(dir, '.env')], {
      ...docker(dir, 'required'),
      COMPOSE_PROJECT_NAME: 'other-project',
      COMPOSE_FILE: '/wrong.yaml',
    });
    expect(result.status).toBe(0);
    const after = settings(dir);
    expect(after.replace(/^PASSDOWN_SETUP_CODE_SHA256=.*$/m, '')).toBe(
      before.replace(/^PASSDOWN_SETUP_CODE_SHA256=.*$/m, ''),
    );
    expect(after).not.toBe(before);
    expect(statSync(join(dir, '.env')).mode & 0o777).toBe(0o600);
    const printed = code(result.stdout);
    expect(after).toContain(createHash('sha256').update(printed.replaceAll('-', '')).digest('hex'));
    expect(files(dir)).not.toContain(printed);
    const args = readFileSync(join(dir, 'docker-arguments'), 'utf8');
    expect(args.split('\n')).toEqual([
      dir,
      'compose',
      '--project-directory',
      dir,
      '--env-file',
      join(dir, '.env'),
      '--project-name',
      before.match(/^COMPOSE_PROJECT_NAME=(.+)$/m)![1],
      '-f',
      'compose.yaml',
      '-f',
      'compose.build.yaml',
      'run',
      '--rm',
      '-T',
      'ops',
      'setup-state',
      '',
    ]);
    expect(result.stdout).toContain('--force-recreate');
    expect(result.stdout).toContain(`-f '${dir}/compose.yaml' -f '${dir}/compose.build.yaml' up`);
  });

  it.each([
    ['complete', 0, 4],
    ['required', 1, 1],
    ['unknown', 0, 1],
    ['', 0, 1],
  ])('refuses renewal for state %s and docker exit %s', (state, dockerStatus, expected) => {
    const dir = directory();
    expect(run(dir, ['--domain', 'localhost']).status).toBe(0);
    const before = settings(dir);
    const result = run(
      dir,
      ['--renew-setup-code'],
      docker(dir, String(state), Number(dockerStatus)),
    );
    expect(result.status).toBe(expected);
    expect(settings(dir)).toBe(before);
    expect(result.stdout).not.toContain('Setup code:');
  });

  it('refuses renewing a symlink or ambiguous hash settings', () => {
    const dir = directory();
    expect(run(dir, ['--domain', 'localhost']).status).toBe(0);
    const before = settings(dir);
    writeFileSync(join(dir, 'original.env'), before);
    rmSync(join(dir, '.env'));
    symlinkSync(join(dir, 'original.env'), join(dir, '.env'));
    expect(run(dir, ['--renew-setup-code'], docker(dir, 'required')).status).toBe(4);
    expect(readFileSync(join(dir, 'original.env'), 'utf8')).toBe(before);
    rmSync(join(dir, '.env'));
    writeFileSync(join(dir, '.env'), `${before}PASSDOWN_SETUP_CODE_SHA256=${'a'.repeat(64)}\n`);
    expect(run(dir, ['--renew-setup-code'], docker(dir, 'required')).status).toBe(3);
  });
});
