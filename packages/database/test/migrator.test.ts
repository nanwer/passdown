import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  readMigrationDirectory,
  assertMigrationsMatchBuild,
  MigrationFailure,
  MigrationValidationError,
  applyMigrations,
} from '../src/migrator';
import { migrationManifest } from '../src/migration-manifest';

it('reads SQL in name order, preserves exact bytes, and computes their checksums', () => {
  const dir = mkdtempSync(join(tmpdir(), 'passdown-migrations-'));
  try {
    writeFileSync(join(dir, '002_second.sql'), 'SELECT 2;\n');
    writeFileSync(join(dir, '001_first.sql'), 'SELECT 1;\r\n');
    writeFileSync(join(dir, 'README.md'), 'not a migration');
    expect(readMigrationDirectory(dir)).toEqual([
      {
        name: '001_first.sql',
        sql: 'SELECT 1;\r\n',
        checksum: createHash('sha256').update('SELECT 1;\r\n').digest('hex'),
      },
      {
        name: '002_second.sql',
        sql: 'SELECT 2;\n',
        checksum: createHash('sha256').update('SELECT 2;\n').digest('hex'),
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
it('refuses missing, changed and additional image migrations', () => {
  const files = readMigrationDirectory(new URL('../migrations', import.meta.url).pathname);
  expect(() => assertMigrationsMatchBuild(files)).not.toThrow();
  expect(files.map(({ name, checksum }) => ({ name, checksum }))).toEqual(migrationManifest);
  expect(() => assertMigrationsMatchBuild(files.slice(1))).toThrow(/match/);
  expect(() =>
    assertMigrationsMatchBuild([...files, { name: '999_extra.sql', sql: '', checksum: 'x' }]),
  ).toThrow(/match/);
  expect(() =>
    assertMigrationsMatchBuild(files.map((f, i) => (i ? f : { ...f, sql: 'SELECT 9;' }))),
  ).toThrow(/match/);
});
it('reports the migration and distinguishes rollback from an unknown commit', () => {
  expect(new MigrationFailure('002.sql', 'syntax error', 'rolled-back').message).toBe(
    'Migration 002.sql failed and was rolled back: syntax error',
  );
  expect(new MigrationFailure('002.sql', 'connection lost', 'uncertain').message).toBe(
    'Migration 002.sql could not be confirmed: connection lost. Check schema status before retrying.',
  );
});

it('classifies migration input failures with safe operator diagnostics', async () => {
  let mismatch: unknown;
  try {
    assertMigrationsMatchBuild([]);
  } catch (error) {
    mismatch = error;
  }
  expect(mismatch).toBeInstanceOf(MigrationValidationError);
  expect(mismatch).toMatchObject({
    problem: 'build-mismatch',
    message: 'Migration files do not match this build. Restore the files shipped with this image.',
  });
  await expect(
    applyMigrations({
      ownerURL: 'postgres://owner:secret@localhost/app',
      runtimeURL: 'postgres://guide_runtime:secret@localhost/app',
      migrations: [{ name: 'private\nvalue.sql', sql: '', checksum: 'invalid' }],
    }),
  ).rejects.toMatchObject({
    name: 'MigrationValidationError',
    problem: 'invalid-files',
    message: 'Invalid migration files or checksums. Restore the files shipped with this build.',
  });
});
