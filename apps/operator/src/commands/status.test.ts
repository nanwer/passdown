import { beforeEach, expect, it, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import {
  ensureRuntimeRole,
  readSchemaStateAsOwner,
  RuntimeRoleError,
  setupStateAsOwner,
  applyMigrations,
  ensureDefaultLogin,
} from '@guide/database';
import { passdownVersion } from '@guide/contracts';
import { runCli, type OperatorIO } from '../cli';
import { commands } from './index';
vi.mock('@guide/database', async (load) => ({
  ...(await load<typeof import('@guide/database')>()),
  readSchemaStateAsOwner: vi.fn(),
  setupStateAsOwner: vi.fn(),
  ensureRuntimeRole: vi.fn(),
  applyMigrations: vi.fn(),
  ensureDefaultLogin: vi.fn(),
  readMigrationDirectory: vi.fn(() => []),
  assertMigrationsMatchBuild: vi.fn(),
}));
function harness(env: Record<string, string> = {}) {
  const out: string[] = [],
    info: string[] = [];
  const io: OperatorIO = {
    out: (s) => out.push(s),
    info: (s) => info.push(s),
    stdin: Readable.from([]),
    stdout: new Writable({ write: (_c, _e, done) => done() }),
    signal: new AbortController().signal,
    migrationsDirectory: 'unused',
    env: {
      GUIDE_OWNER_DATABASE_URL: 'postgresql://guide_owner:owner-secret@127.0.0.1:5432/app',
      GUIDE_DATABASE_URL: 'postgresql://guide_runtime:runtime-secret@127.0.0.1:5432/app',
      ...env,
    },
  };
  return { out, info, io };
}
beforeEach(() => {
  vi.mocked(applyMigrations).mockReset();
  vi.mocked(ensureDefaultLogin).mockReset();
  vi.mocked(readSchemaStateAsOwner).mockReset();
  vi.mocked(setupStateAsOwner).mockReset();
  vi.mocked(ensureRuntimeRole).mockReset();
});
it('status reports a current schema and the setup state', async () => {
  vi.mocked(readSchemaStateAsOwner).mockResolvedValue({ ok: true, applied: 30, ahead: [] });
  vi.mocked(setupStateAsOwner).mockResolvedValue('complete');
  const h = harness();
  expect(await runCli(['status'], h.io, commands)).toBe(0);
  expect(h.out).toEqual(['Database schema is current (30 migrations applied).', 'Setup: complete']);
});
it('status exits one and names pending migrations when the schema is behind', async () => {
  vi.mocked(readSchemaStateAsOwner).mockResolvedValue({
    ok: false,
    reason: 'pending',
    pending: ['031_example.sql'],
    applied: 30,
  });
  const h = harness();
  expect(await runCli(['status'], h.io, commands)).toBe(1);
  expect(h.info.join('\n')).toContain('031_example.sql');
  expect(setupStateAsOwner).not.toHaveBeenCalled();
});
it('status warns when the database is newer than this build', async () => {
  vi.mocked(readSchemaStateAsOwner).mockResolvedValue({
    ok: true,
    applied: 31,
    ahead: ['031_example.sql'],
  });
  vi.mocked(setupStateAsOwner).mockResolvedValue('default-login');
  const h = harness();
  expect(await runCli(['status'], h.io, commands)).toBe(0);
  expect(h.out).toEqual([
    'Database schema is current (31 migrations applied).',
    'Setup: default-login',
  ]);
  expect(h.info.join('\n')).toContain('031_example.sql');
});
it('version prints the version and a known revision without any settings', async () => {
  const sha = 'aeb95530846d9c52c5fb22feae69187dd0e9c5bf';
  const h = harness({ PASSDOWN_REVISION: sha });
  h.io.env = { PASSDOWN_REVISION: sha };
  expect(await runCli(['version'], h.io, commands)).toBe(0);
  expect(h.out).toEqual([`passdown ${passdownVersion} (revision ${sha.slice(0, 12)})`]);
  const unknown = harness();
  unknown.io.env = {};
  expect(await runCli(['version'], unknown.io, commands)).toBe(0);
  expect(unknown.out).toEqual([`passdown ${passdownVersion} (revision unknown)`]);
});
it('runtime-password sets and proves the runtime password, then says to recreate web', async () => {
  vi.mocked(ensureRuntimeRole).mockResolvedValue({ created: false, passwordChanged: true });
  const h = harness();
  expect(await runCli(['runtime-password'], h.io, commands)).toBe(0);
  expect(vi.mocked(ensureRuntimeRole).mock.calls[0]![0]).toMatchObject({
    setPassword: true,
    phase: 'after-schema',
  });
  expect(h.out.join('\n')).toContain('docker compose up -d --force-recreate web');
  expect(JSON.stringify([h.out, h.info])).not.toContain('runtime-secret');
});
it('runtime-password refuses an unsafe runtime role with exit four', async () => {
  vi.mocked(ensureRuntimeRole).mockRejectedValue(new RuntimeRoleError('membership'));
  const h = harness();
  expect(await runCli(['runtime-password'], h.io, commands)).toBe(4);
});
it('migrate creates the default login on a fresh database and says how to use it', async () => {
  vi.mocked(applyMigrations).mockResolvedValue({ applied: ['033_default_login.sql'], total: 33 });
  vi.mocked(ensureDefaultLogin).mockResolvedValue('created');
  const h = harness();
  expect(await runCli(['migrate'], h.io, commands)).toBe(0);
  expect(vi.mocked(ensureDefaultLogin).mock.calls[0]).toEqual([
    'postgresql://guide_owner:owner-secret@127.0.0.1:5432/app',
    'loopback',
  ]);
  expect(h.out).toEqual([
    'Migrations are current: 33 recorded, 1 applied now.',
    'Created the default login admin@example.com. Sign in with it and finish setting up.',
  ]);
});
it('migrate leaves an installation with accounts alone', async () => {
  vi.mocked(applyMigrations).mockResolvedValue({ applied: [], total: 33 });
  vi.mocked(ensureDefaultLogin).mockResolvedValue('not-needed');
  const h = harness();
  expect(await runCli(['migrate'], h.io, commands)).toBe(0);
  expect(h.out).toEqual(['Migrations are current: 33 recorded, 0 applied now.']);
});
it('migrate does not create an account when migrations fail', async () => {
  const { MigrationFailure } =
    await vi.importActual<typeof import('@guide/database')>('@guide/database');
  vi.mocked(applyMigrations).mockRejectedValue(
    new MigrationFailure('034_x.sql', 'PostgreSQL error 42P07'),
  );
  const h = harness();
  expect(await runCli(['migrate'], h.io, commands)).toBe(1);
  expect(ensureDefaultLogin).not.toHaveBeenCalled();
});
it('operator commands read database passwords from the files the Docker install names', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'passdown-operator-files-'));
  try {
    writeFileSync(join(dir, 'owner'), 'o'.repeat(64) + '\n');
    vi.mocked(readSchemaStateAsOwner).mockResolvedValue({ ok: true, applied: 33, ahead: [] });
    vi.mocked(setupStateAsOwner).mockResolvedValue('complete');
    const h = harness();
    h.io.env = {
      NODE_ENV: 'production',
      GUIDE_DB_OWNER_PASSWORD_FILE: join(dir, 'owner'),
      PASSDOWN_DATABASE_HOST: 'postgres',
    };
    expect(await runCli(['status'], h.io, commands)).toBe(0);
    expect(vi.mocked(readSchemaStateAsOwner).mock.calls[0]).toEqual([
      `postgresql://guide_owner:${'o'.repeat(64)}@postgres:5432/guide_app`,
      'deployment',
    ]);
    const missing = harness();
    missing.io.env = { GUIDE_DB_OWNER_PASSWORD_FILE: join(dir, 'absent') };
    expect(await runCli(['status'], missing.io, commands)).toBe(3);
    expect(missing.info.join('\n')).toContain('GUIDE_DB_OWNER_PASSWORD_FILE');
    expect(JSON.stringify([h.out, h.info, missing.info])).not.toContain('o'.repeat(64));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
