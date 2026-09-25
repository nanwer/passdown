import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  applyMigrations: vi.fn(),
  ensureDefaultLogin: vi.fn(),
}));
vi.mock('@guide/database', async (original) => ({
  ...(await original<typeof import('@guide/database')>()),
  readMigrationDirectory: () => [],
  assertMigrationsMatchBuild: () => {},
  applyMigrations: database.applyMigrations,
  ensureDefaultLogin: database.ensureDefaultLogin,
}));
const { MigrationFailure } = await import('@guide/database');
const { runCli } = await import('../cli');
const { migrateCommand } = await import('./migrate');

type Options = { onApplying?: (name: string) => void; onApplied?: (name: string) => void };
const directories: string[] = [];
let status: string;
beforeEach(() => {
  status = mkdtempSync(join(tmpdir(), 'passdown-migration-status-'));
  directories.push(status);
  database.applyMigrations.mockReset();
  database.ensureDefaultLogin.mockReset().mockResolvedValue('exists');
});
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
async function migrate(args: string[] = ['--status-dir', status]) {
  const out: string[] = [],
    info: string[] = [];
  const code = await runCli(
    ['migrate', ...args],
    {
      out: (s) => out.push(s),
      info: (s) => info.push(s),
      env: {
        GUIDE_OWNER_DATABASE_URL: 'postgres://owner:password@127.0.0.1:1/unused',
        GUIDE_DATABASE_URL: 'postgres://guide_runtime:password@127.0.0.1:1/unused',
      },
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      signal: new AbortController().signal,
      migrationsDirectory: '/unused',
    },
    [migrateCommand],
  );
  return { code, out, info: info.join('\n'), notices: readdirSync(status).sort() };
}
const failing =
  (committed: number, outcome: 'rolled-back' | 'uncertain' = 'rolled-back') =>
  async (options: Options) => {
    for (let index = 1; index <= committed; index++) {
      options.onApplying?.(`04${index}_example.sql`);
      options.onApplied?.(`04${index}_example.sql`);
    }
    options.onApplying?.('049_failing.sql');
    throw new MigrationFailure('049_failing.sql', 'PostgreSQL error 42P07', outcome);
  };

it('leaves a notice that nothing changed when the first pending migration fails', async () => {
  database.applyMigrations.mockImplementation(failing(0));
  const result = await migrate();
  expect(result.code).toBe(1);
  expect(result.notices).toEqual(['migration-failed']);
  expect(result.info).toContain('Migration 049_failing.sql failed and was rolled back');
  expect(result.info).toContain('no data was changed');
  expect(result.info).toContain('put the previous version back in the compose file');
});

it.each([
  ['an earlier migration was applied', failing(1)],
  ['the last commit cannot be confirmed', failing(0, 'uncertain')],
])('says the database changed when %s', async (_, implementation) => {
  database.applyMigrations.mockImplementation(implementation);
  const result = await migrate();
  expect(result.code).toBe(1);
  expect(result.notices).toEqual(['migration-incomplete']);
  expect(result.info).not.toContain('no data was changed');
  expect(result.info).toContain('Some of the new version');
});

it('counts a failure after every migration applied as a changed database', async () => {
  database.applyMigrations.mockImplementation(async (options: Options) => {
    options.onApplied?.('040_example.sql');
    return { applied: ['040_example.sql'], total: 40 };
  });
  database.ensureDefaultLogin.mockRejectedValue(Object.assign(new Error('x'), { code: '53300' }));
  const result = await migrate();
  expect(result.code).toBe(1);
  expect(result.notices).toEqual(['migration-incomplete']);
});

it('removes an earlier notice once migrations succeed', async () => {
  writeFileSync(join(status, 'migration-failed'), 'stale\n');
  writeFileSync(join(status, 'migration-incomplete'), 'stale\n');
  database.applyMigrations.mockResolvedValue({ applied: [], total: 33 });
  const result = await migrate();
  expect(result.code).toBe(0);
  expect(result.notices).toEqual([]);
  expect(result.out[0]).toBe('Migrations are current: 33 recorded, 0 applied now.');
});

it('replaces an earlier notice with the one for this attempt', async () => {
  writeFileSync(join(status, 'migration-incomplete'), 'stale\n');
  database.applyMigrations.mockImplementation(failing(0));
  expect((await migrate()).notices).toEqual(['migration-failed']);
});

it('writes no notice without a status directory, as when upgrade.sh migrates', async () => {
  database.applyMigrations.mockImplementation(failing(0));
  const result = await migrate([]);
  expect(result.code).toBe(1);
  expect(result.notices).toEqual([]);
  expect(result.info).not.toContain('compose file');
});

it('still reports the migration failure when the notice cannot be written', async () => {
  database.applyMigrations.mockImplementation(failing(0));
  const result = await migrate(['--status-dir', join(status, 'missing')]);
  expect(result.code).toBe(1);
  expect(result.info).toContain('Migration 049_failing.sql failed and was rolled back');
  expect(result.info).toContain('Could not record the migration result');
});
