import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// A fake docker that records each call, one argument per line, and answers
// only what the upgrade asks.
const fakeDocker = `#!/bin/sh
{ printf 'CALL pwd=%s project=%s\\n' "$PWD" "\${COMPOSE_PROJECT_NAME-unset}"; printf '%s\\n' "$@"; } >> "$DOCKER_LOG"
case "$*" in
  *' ps -q web') [ "$WEB_RUNNING" = 1 ] && printf '%s\\n' web-container ;;
  'inspect --format {{.State.Running}} web-container') printf '%s\\n' true ;;
  'inspect --format {{.Image}} web-container') printf '%s\\n' sha256:previous-web ;;
  *' pull --quiet --ignore-buildable --policy missing') exit "\${PULL_STATUS:-0}" ;;
  *' run --rm -T migrate migrate') exit "\${MIGRATE_STATUS:-0}" ;;
  *' up -d --wait --wait-timeout 300') exit "\${UP_STATUS:-0}" ;;
  *' run --rm -T ops version') printf '%s\\n' 'passdown 0.1.0-alpha.2 (revision abc)' ;;
  *' run --rm -T ops status') printf '%s\\n' 'Database schema is current (34 migrations applied).' 'Setup: complete' ;;
esac
exit 0
`;

function installation() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'passdown upgrade ')));
  directories.push(dir);
  copyFileSync(resolve('deploy/upgrade.sh'), join(dir, 'upgrade.sh'));
  writeFileSync(join(dir, 'compose.yaml'), 'services: {}\n');
  writeFileSync(join(dir, 'compose.build.yaml'), 'services: {}\n');
  writeFileSync(
    join(dir, 'backup.sh'),
    `#!/bin/sh\n{ printf 'BACKUP\\n'; printf '%s\\n' "$@"; } >> "$DOCKER_LOG"\nexit "\${BACKUP_STATUS:-0}"\n`,
  );
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'docker'), fakeDocker, { mode: 0o755 });
  const log = join(dir, 'docker.log');
  writeFileSync(log, '');
  const run = (args: string[] = [], env: Record<string, string> = {}) =>
    spawnSync('sh', [join(dir, 'upgrade.sh'), ...args], {
      cwd: tmpdir(),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        DOCKER_LOG: log,
        WEB_RUNNING: '1',
        // An unrelated shell setting must not redirect the upgrade.
        COMPOSE_PROJECT_NAME: 'someone-elses-project',
        ...env,
      },
    });
  const calls = () =>
    readFileSync(log, 'utf8')
      .split(/^(?=CALL |BACKUP$)/m)
      .filter(Boolean)
      .map((call) => call.trim().split('\n'));
  return { dir, run, calls, log: () => log };
}

describe('upgrading a command-line installation', () => {
  it('backs up with the running version, migrates with the new one, then replaces web', () => {
    const h = installation();
    const result = h.run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Upgrade complete.');
    const compose = ['-f', join(h.dir, 'compose.yaml')];
    const steps = h
      .calls()
      .map(([first, ...rest]) => (first === 'BACKUP' ? ['BACKUP', ...rest] : rest));
    expect(steps).toEqual([
      ['compose', ...compose, 'ps', '-q', 'web'],
      ['inspect', '--format', '{{.State.Running}}', 'web-container'],
      ['inspect', '--format', '{{.Image}}', 'web-container'],
      ['BACKUP', '--file', join(h.dir, 'compose.yaml'), '--image', 'sha256:previous-web'],
      ['compose', ...compose, 'pull', '--quiet', '--ignore-buildable', '--policy', 'missing'],
      // The command given explicitly, without the compose file's status
      // directory: a failure here leaves the old version serving, so no
      // "upgrade failed" notice may be left for the proxy to show later.
      ['compose', ...compose, 'run', '--rm', '-T', 'migrate', 'migrate'],
      ['compose', ...compose, 'up', '-d', '--wait', '--wait-timeout', '300'],
      ['compose', ...compose, 'run', '--rm', '-T', 'ops', 'version'],
      ['compose', ...compose, 'run', '--rm', '-T', 'ops', 'status'],
    ]);
    expect(readFileSync(h.log(), 'utf8')).not.toContain('someone-elses-project');
  });

  it('leaves the running site alone when migrations fail', () => {
    const h = installation();
    const result = h.run(['--skip-backup'], { MIGRATE_STATUS: '1' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('still running the previous version');
    const steps = h.calls().map((call) => call.slice(1).join(' '));
    expect(steps.some((step) => step.includes(' up '))).toBe(false);
    expect(steps.some((step) => step.startsWith('BACKUP'))).toBe(false);
  });

  it('stops before changing anything when the backup or the download fails', () => {
    for (const [env, message] of [
      [{ BACKUP_STATUS: '1' }, 'The backup failed, so nothing was upgraded.'],
      [{ PULL_STATUS: '1' }, 'The new images could not be fetched. Nothing was changed.'],
    ] as const) {
      const h = installation();
      const result = h.run([], env);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(readFileSync(h.log(), 'utf8')).not.toMatch(/\nmigrate\n|\nup\n/);
    }
  });

  it('refuses when the installation is not running, so a first start stays explicit', () => {
    const h = installation();
    const result = h.run([], { WEB_RUNNING: '0' });
    expect(result.status).toBe(4);
    expect(result.stderr).toContain('For a first start, use docker compose up -d.');
    expect(h.calls()).toHaveLength(1);
  });

  it('passes overlays and the project to every command, keeping paths with spaces whole', () => {
    const h = installation();
    const result = h.run([
      '--file',
      join(h.dir, 'compose.yaml'),
      '--file',
      join(h.dir, 'compose.build.yaml'),
      '--project',
      'passdown-home',
    ]);
    expect(result.status).toBe(0);
    for (const call of h.calls()) {
      if (call[0] === 'BACKUP')
        expect(call.slice(1, 7)).toEqual([
          '--file',
          join(h.dir, 'compose.yaml'),
          '--file',
          join(h.dir, 'compose.build.yaml'),
          '--project',
          'passdown-home',
        ]);
      else if (call[1] === 'compose')
        expect(call.slice(2, 8)).toEqual([
          '-f',
          join(h.dir, 'compose.yaml'),
          '-f',
          join(h.dir, 'compose.build.yaml'),
          '--project-name',
          'passdown-home',
        ]);
    }
  });

  it('refuses an invalid project name or a missing file', () => {
    const h = installation();
    expect(h.run(['--project', 'Bad Name']).status).toBe(2);
    expect(h.run(['--file', join(h.dir, 'absent.yaml')]).status).toBe(3);
    expect(h.calls()).toHaveLength(0);
  });
});
