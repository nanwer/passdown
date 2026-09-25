import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
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
import { afterEach, describe, expect, it } from 'vitest';
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));
function harness() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'passdown-backup-wrapper-')));
  roots.push(root);
  const deploy = join(root, 'deployment');
  const bin = join(root, 'bin');
  const caller = join(root, 'caller');
  for (const dir of [deploy, bin, caller]) mkdirSync(dir);
  const script = join(deploy, 'backup.sh');
  copyFileSync(resolve('deploy/backup.sh'), script);
  writeFileSync(join(deploy, '.env'), 'COMPOSE_PROJECT_NAME=synthetic-project\n');
  const log = join(root, 'docker.log');
  writeFileSync(join(bin, 'date'), '#!/bin/sh\nprintf "20260925T100000Z\\n"\n', { mode: 0o700 });
  writeFileSync(
    join(bin, 'sync'),
    `#!/bin/sh
printf 'SYNC\\n' >> "$BACKUP_LOG"
[ "$BACKUP_MODE" != sync-fail ] || exit 27
`,
    { mode: 0o700 },
  );
  writeFileSync(
    join(bin, 'docker'),
    `#!/bin/sh
printf '%s\\n' CALL "PWD=$PWD" "$@" >> "$BACKUP_LOG"
case "$*" in
  *' ops backup')
    printf 'synthetic-complete-archive'
    [ "$BACKUP_MODE" != backup-fail ] || exit 23
    if [ "$BACKUP_MODE" = interrupt ]; then printf 'ready\\n' >&2; exec sleep 30; fi
    ;;
  *' ops restore --check')
    [ "$(cat)" = synthetic-complete-archive ] || exit 25
    [ "$BACKUP_MODE" != check-fail ] || exit 24
    printf 'offline check passed\\n'
    ;;
  *) exit 26 ;;
esac
`,
    { mode: 0o700 },
  );
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, BACKUP_LOG: log };
  const run = (args: string[] = [], extra: Record<string, string | undefined> = {}) =>
    spawnSync('sh', [script, ...args], {
      cwd: caller,
      env: { ...env, ...extra },
      encoding: 'utf8',
    });
  return { root, deploy, caller, script, env, log, run };
}
const completion = (child: ChildProcess) =>
  new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
describe('host backup wrapper', () => {
  it('checks before publishing private bytes and anchors default settings to the script directory', () => {
    const h = harness();
    const result = h.run();
    expect(result.status).toBe(0);
    const final = result.stdout.trim();
    expect(final).toBe(join(h.deploy, 'backups', 'passdown-20260925T100000Z.tar'));
    expect(readFileSync(final, 'utf8')).toBe('synthetic-complete-archive');
    expect(statSync(final).mode & 0o777).toBe(0o600);
    expect(result.stdout).not.toContain('synthetic-complete-archive');
    expect(result.stderr).toContain('offline check passed');
    const calls = readFileSync(h.log, 'utf8').split('CALL\n').slice(1);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call).toContain(
        `compose\n--project-directory\n${h.deploy}\n--env-file\n${h.deploy}/.env\n`,
      );
      // Settings name their Compose files relatively; Compose resolves them
      // against the working directory, so run from the installation directory.
      expect(call.startsWith(`PWD=${h.deploy}\n`)).toBe(true);
    }
    expect(calls[0]).toContain('run\n--rm\n-T\nops\nbackup\n');
    expect(calls[1]).toContain('run\n--rm\n--no-deps\n-T\nops\nrestore\n--check\n');
    expect(readdirSync(join(h.deploy, 'backups'))).toEqual(['passdown-20260925T100000Z.tar']);
    const settings = join(h.caller, 'alternate.env');
    writeFileSync(settings, 'COMPOSE_PROJECT_NAME=other-project\n');
    const explicit = h.run(['--env-file', 'alternate.env', 'relative backups']);
    expect(explicit.status).toBe(0);
    expect(explicit.stdout.trim()).toBe(
      join(h.caller, 'relative backups', 'passdown-20260925T100000Z.tar'),
    );
    expect(readFileSync(h.log, 'utf8')).toContain(`--env-file\n${settings}\n`);
  });
  it.each(['backup-fail', 'check-fail'])('removes only its own partial after %s', (mode) => {
    const h = harness();
    const dir = join(h.root, 'backups');
    mkdirSync(dir);
    writeFileSync(join(dir, '.passdown-backup.foreign'), 'preserve');
    const result = h.run([dir], { BACKUP_MODE: mode });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe('');
    expect(readdirSync(dir)).toEqual(['.passdown-backup.foreign']);
    expect(readFileSync(h.log, 'utf8').includes('restore\n--check')).toBe(mode === 'check-fail');
  });
  it('flushes the verified partial before publishing and refuses a failed flush', () => {
    const h = harness();
    const dir = join(h.root, 'backups');
    const failed = h.run([dir], { BACKUP_MODE: 'sync-fail' });
    expect(failed.status).toBe(27);
    expect(failed.stdout).toBe('');
    expect(readdirSync(dir)).toEqual([]);
    const log = readFileSync(h.log, 'utf8');
    expect(log.indexOf('SYNC')).toBeGreaterThan(log.indexOf('--check'));
  });
  it('cleans its partial and terminates the active command on interruption', async () => {
    const h = harness();
    const dir = join(h.root, 'backups');
    const child = spawn('sh', [h.script, dir], {
      cwd: h.caller,
      env: { ...h.env, BACKUP_MODE: 'interrupt' },
    });
    const exited = completion(child);
    await new Promise<void>((resolve, reject) => {
      child.stderr!.on('data', (chunk) => {
        if (String(chunk).includes('ready')) resolve();
      });
      child.once('error', reject);
    });
    child.kill('SIGTERM');
    expect(await exited).toBe(143);
    expect(readdirSync(dir)).toEqual([]);
  });
  it('does not replace existing files, symlinks or directories and bounds naming attempts', () => {
    const h = harness();
    const dir = join(h.root, 'backups');
    mkdirSync(dir);
    const base = join(dir, 'passdown-20260925T100000Z');
    writeFileSync(`${base}.tar`, 'preserve');
    symlinkSync(`${base}.tar`, `${base}-2.tar`);
    mkdirSync(`${base}-3.tar`);
    const result = h.run([dir]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(`${base}-4.tar`);
    expect(readFileSync(`${base}.tar`, 'utf8')).toBe('preserve');
    expect(readdirSync(`${base}-3.tar`)).toEqual([]);
    for (let n = 5; n <= 99; n++) writeFileSync(`${base}-${n}.tar`, 'preserve');
    expect(h.run([dir]).status).not.toBe(0);
    expect(readdirSync(dir).filter((name) => name.startsWith('.passdown'))).toEqual([]);
  });
  it('concurrent runs publish distinct complete files without sharing partials', async () => {
    const h = harness();
    const dir = join(h.root, 'backups');
    const children = [0, 1].map(() => spawn('sh', [h.script, dir], { cwd: h.caller, env: h.env }));
    expect(await Promise.all(children.map(completion))).toEqual([0, 0]);
    const files = readdirSync(dir);
    expect(files).toHaveLength(2);
    for (const file of files) {
      expect(file).toMatch(/^passdown-.*\.tar$/);
      expect(readFileSync(join(dir, file), 'utf8')).toBe('synthetic-complete-archive');
      expect(statSync(join(dir, file)).mode & 0o777).toBe(0o600);
    }
  });
});
