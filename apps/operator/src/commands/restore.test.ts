import { PassThrough } from 'node:stream';
import { RuntimeRoleError } from '@guide/database';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../cli';
import { restoreCommand } from './restore';
import { performRestore } from '../lifecycle/restore-flow';
vi.mock('../lifecycle/restore-flow', () => ({ performRestore: vi.fn() }));
import { ToolFailure } from '../lifecycle/run-tool';
import { BackupValidationError, checkBackup } from '../lifecycle/backup-check';
vi.mock('../lifecycle/backup-check', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lifecycle/backup-check')>()),
  checkBackup: vi.fn(),
}));
function context() {
  return {
    env: {},
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    signal: new AbortController().signal,
    migrationsDirectory: '/unused',
    out: vi.fn(),
    info: vi.fn(),
  };
}
describe('restore command boundary', () => {
  it('checks stdin offline without database configuration', async () => {
    vi.mocked(checkBackup).mockResolvedValueOnce({} as Awaited<ReturnType<typeof checkBackup>>);
    const io = context();
    expect(await runCli(['restore', '--check'], io, [restoreCommand])).toBe(0);
    expect(checkBackup).toHaveBeenLastCalledWith(io.stdin, { signal: io.signal });
    expect(io.out).toHaveBeenCalledWith(expect.stringContaining('No database was restored'));
  });
  it.each([[], ['--activate'], ['--discard']].map((flags) => ({ flags })))(
    'requires configuration for database restore %s',
    async ({ flags }) => {
      expect(await runCli(['restore', ...flags], context(), [restoreCommand])).toBe(3);
    },
  );
  it('runs restore with configured owner, runtime and media', async () => {
    const io = {
      ...context(),
      env: {
        GUIDE_OWNER_DATABASE_URL: 'postgres://owner:password@localhost/test',
        GUIDE_DATABASE_URL: 'postgres://guide_runtime:password@localhost/test',
        GUIDE_MEDIA_ROOT: '/tmp/restore-test',
      },
    };
    expect(await runCli(['restore'], io, [restoreCommand])).toBe(0);
    expect(performRestore).toHaveBeenCalled();
  });
  it.each(
    [
      ['--activate', '--discard'],
      ['--check', '--activate'],
      ['--discard', '--from', '/tmp/source'],
    ].map((flags) => ({ flags })),
  )('rejects incompatible options before configuration %s', async ({ flags }) => {
    expect(await runCli(['restore', ...flags], context(), [restoreCommand])).toBe(2);
  });
  it('explains a failed neutral-database password proof without exposing credentials', async () => {
    vi.mocked(performRestore).mockRejectedValueOnce(new RuntimeRoleError('password'));
    const io = {
      ...context(),
      env: {
        GUIDE_OWNER_DATABASE_URL: 'postgres://owner:password@localhost/test',
        GUIDE_DATABASE_URL: 'postgres://guide_runtime:password@localhost/test',
        GUIDE_MEDIA_ROOT: '/tmp/restore-test',
      },
    };
    expect(await runCli(['restore', '--activate'], io, [restoreCommand])).toBe(1);
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('postgres'));
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('--activate'));
  });
  it('does not echo private data from a rejected archive or tool', async () => {
    vi.mocked(checkBackup).mockRejectedValueOnce(new Error('synthetic-private-payload'));
    const io = context();
    expect(await runCli(['restore', '--check'], io, [restoreCommand])).toBe(1);
    expect(JSON.stringify(io.info.mock.calls)).not.toContain('synthetic-private-payload');
    expect(io.out).not.toHaveBeenCalled();
  });
  it('refuses a malformed archive with exit 4', async () => {
    vi.mocked(checkBackup).mockRejectedValueOnce(new BackupValidationError());
    expect(await runCli(['restore', '--check'], context(), [restoreCommand])).toBe(4);
  });
  it.each([
    Object.assign(new Error('private disk path'), { code: 'ENOSPC' }),
    Object.assign(new Error('private tool path'), { code: 'ENOENT' }),
    new ToolFailure('pg_restore', 1, 'private database detail'),
    new DOMException('private abort detail', 'AbortError'),
  ])('reports an operational failure with exit 1 and safe text', async (error) => {
    vi.mocked(checkBackup).mockRejectedValueOnce(error);
    const io = context();
    expect(await runCli(['restore', '--check'], io, [restoreCommand])).toBe(1);
    expect(JSON.stringify(io.info.mock.calls)).not.toContain('private');
  });
  it.each(['--unknown'])('refuses unsupported option %s', async (option) => {
    const io = context();
    expect(await runCli(['restore', option], io, [restoreCommand])).toBe(2);
  });
});
