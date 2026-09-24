import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../cli';
import { restoreCommand } from './restore';
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
  it('refuses destructive restore before reading input', async () => {
    vi.mocked(checkBackup).mockClear();
    const io = context();
    expect(await runCli(['restore'], io, [restoreCommand])).toBe(4);
    expect(checkBackup).not.toHaveBeenCalled();
    expect(io.info).toHaveBeenCalledWith(expect.stringContaining('not available yet'));
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
  it.each(['--activate', '--discard', '--unknown'])(
    'refuses unsupported option %s',
    async (option) => {
      const io = context();
      expect(await runCli(['restore', option], io, [restoreCommand])).toBe(2);
    },
  );
});
