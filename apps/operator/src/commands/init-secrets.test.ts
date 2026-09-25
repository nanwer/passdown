import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it } from 'vitest';
import { runCli } from '../cli';
import { commands } from './index';
import { initSecrets } from './init-secrets';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function volumes() {
  const root = mkdtempSync(join(tmpdir(), 'passdown-init-secrets-'));
  roots.push(root);
  const ownerDir = join(root, 'owner');
  const appDir = join(root, 'app');
  mkdirSync(ownerDir);
  mkdirSync(appDir);
  return { ownerDir, appDir };
}
const mode = (path: string) => lstatSync(path).mode & 0o777;
const harness = () => {
  const out: string[] = [],
    info: string[] = [];
  return {
    out,
    info,
    io: {
      out: (s: string) => out.push(s),
      info: (s: string) => info.push(s),
      env: {},
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      signal: new AbortController().signal,
      migrationsDirectory: '/unused',
    },
  };
};

it('creates private random secrets once and keeps them afterwards', async () => {
  const dirs = volumes();
  const first = await initSecrets(dirs);
  expect(first).toEqual({
    created: ['database-owner-password', 'database-runtime-password', 'session-secret'],
    kept: [],
  });
  const owner = readFileSync(join(dirs.ownerDir, 'database-owner-password'), 'utf8');
  const runtime = readFileSync(join(dirs.appDir, 'database-runtime-password'), 'utf8');
  const session = readFileSync(join(dirs.appDir, 'session-secret'), 'utf8');
  expect(owner).toMatch(/^[0-9a-f]{64}\n$/);
  expect(runtime).toMatch(/^[0-9a-f]{64}\n$/);
  expect(session).toMatch(/^[0-9a-f]{96}\n$/);
  expect(new Set([owner, runtime]).size).toBe(2);
  // Owner password: readable by its owner and the database's group only.
  // App secrets: by their owner only. Nothing else in the volumes.
  expect(mode(join(dirs.ownerDir, 'database-owner-password'))).toBe(0o440);
  expect(mode(join(dirs.appDir, 'database-runtime-password'))).toBe(0o400);
  expect(mode(join(dirs.appDir, 'session-secret'))).toBe(0o400);
  expect(mode(dirs.ownerDir)).toBe(0o750);
  expect(mode(dirs.appDir)).toBe(0o700);
  expect(readdirSync(dirs.ownerDir)).toEqual(['database-owner-password']);
  expect(readdirSync(dirs.appDir).sort()).toEqual(['database-runtime-password', 'session-secret']);

  const second = await initSecrets(dirs);
  expect(second).toEqual({
    created: [],
    kept: ['database-owner-password', 'database-runtime-password', 'session-secret'],
  });
  expect(readFileSync(join(dirs.ownerDir, 'database-owner-password'), 'utf8')).toBe(owner);
  expect(readFileSync(join(dirs.appDir, 'session-secret'), 'utf8')).toBe(session);
});

it('creates only what is missing', async () => {
  const dirs = volumes();
  writeFileSync(join(dirs.ownerDir, 'database-owner-password'), 'kept-owner\n', { mode: 0o440 });
  expect(await initSecrets(dirs)).toEqual({
    created: ['database-runtime-password', 'session-secret'],
    kept: ['database-owner-password'],
  });
  expect(readFileSync(join(dirs.ownerDir, 'database-owner-password'), 'utf8')).toBe('kept-owner\n');
});

it('refuses links, empty secrets and missing volumes instead of trusting them', async () => {
  const dirs = volumes();
  symlinkSync('/etc/hostname', join(dirs.appDir, 'session-secret'));
  await expect(initSecrets(dirs)).rejects.toThrow(/session-secret is not a regular file/);
  rmSync(join(dirs.appDir, 'session-secret'));
  writeFileSync(join(dirs.appDir, 'session-secret'), '');
  await expect(initSecrets(dirs)).rejects.toThrow(/session-secret is empty/);
  await expect(initSecrets({ ...dirs, appDir: join(dirs.appDir, 'absent') })).rejects.toThrow(
    /not mounted/,
  );
});

it('runs as an operator command without any database settings', async () => {
  const dirs = volumes();
  const h = harness();
  expect(
    await runCli(
      ['init-secrets', '--owner-dir', dirs.ownerDir, '--app-dir', dirs.appDir],
      h.io,
      commands,
    ),
  ).toBe(0);
  expect(h.out).toEqual(['Created 3 secrets; kept 0 existing.']);
  const again = harness();
  expect(
    await runCli(
      ['init-secrets', '--owner-dir', dirs.ownerDir, '--app-dir', dirs.appDir],
      again.io,
      commands,
    ),
  ).toBe(0);
  expect(again.out).toEqual(['Secrets already exist; nothing was changed.']);
  expect([...h.out, ...h.info, ...again.out].join('\n')).not.toMatch(/[0-9a-f]{32}/);
});

it('prepares the migration status volume for the migration job when it is mounted', async () => {
  const dirs = volumes();
  const statusDir = join(dirs.appDir, '..', 'status');
  mkdirSync(statusDir, { mode: 0o700 });
  await initSecrets({ ...dirs, statusDir });
  // Readable by the proxy, which shows its notices; nothing secret is kept there.
  expect(mode(statusDir)).toBe(0o755);
  expect(readdirSync(statusDir)).toEqual([]);
  // An installation whose compose file predates the volume still starts.
  await expect(
    initSecrets({ ...dirs, statusDir: join(dirs.appDir, '..', 'absent') }),
  ).resolves.toMatchObject({ created: [] });
});
