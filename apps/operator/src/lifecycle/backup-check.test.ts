import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectedMigrations } from '@guide/database';
import { tarArchive } from './ustar';
import { BackupValidationError, checkBackup } from './backup-check';
import type { BackupManifest } from './manifest';
import { runTool } from './run-tool';
vi.mock('./run-tool', () => ({ runTool: vi.fn() }));
const digest = (value: Buffer) => ({
  bytes: value.length,
  sha256: createHash('sha256').update(value).digest('hex'),
});
const pack = async (entries: { name: string; bytes: Buffer }[]) => {
  const chunks: Buffer[] = [];
  for await (const chunk of tarArchive(
    entries.map(({ name, bytes }) => ({
      name,
      size: bytes.length,
      content: Readable.from([bytes]),
    })),
  ))
    chunks.push(chunk);
  return Buffer.concat(chunks);
};
const workspace = 'repair-collective',
  asset = '11111111-1111-4111-8111-111111111111';
async function archive(
  change?: (m: BackupManifest, files: Record<string, Buffer>) => void,
  mediaName = `${workspace}/${asset}.display.webp`,
) {
  const files: Record<string, Buffer> = {
    'database.dump': Buffer.from('PGDMP-synthetic'),
    'media.tar': await pack([{ name: mediaName, bytes: Buffer.from('synthetic picture') }]),
  };
  const manifest: BackupManifest = {
    format: 'passdown-backup/1',
    complete: true,
    createdBy: { passdown: '0.1.0', revision: 'unknown' },
    startedAt: '2026-09-25T10:00:00.000Z',
    snapshotAt: '2026-09-25T10:00:00.000Z',
    completedAt: '2026-09-25T10:00:01.000Z',
    database: { name: 'guide_app', server: '17.6', pgDump: 'pg_dump (PostgreSQL) 17.6' },
    migrations: expectedMigrations(),
    counts: {
      'app.guide': 1,
      'public.auth_session': null,
      'public.auth_verification': null,
      'app.rate_limit': null,
    },
    excludedData: ['public.auth_session', 'public.auth_verification', 'app.rate_limit'],
    credentials: { openResetLinks: null, pendingInvitations: 0 },
    media: {
      files: 1,
      bytes: Buffer.byteLength('synthetic picture'),
      missingAtBackup: [],
      renditionsIncluded: false,
    },
    files: {
      'database.dump': digest(files['database.dump']!),
      'media.tar': digest(files['media.tar']!),
    },
  };
  change?.(manifest, files);
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest));
  files.SHA256SUMS = Buffer.from(
    ['database.dump', 'media.tar', 'manifest.json']
      .map((name) => `${digest(files[name]!).sha256}  ${name}\n`)
      .join(''),
  );
  return {
    manifest,
    files,
    bytes: await pack(Object.entries(files).map(([name, bytes]) => ({ name, bytes }))),
  };
}
const directories: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function harness(version = 'pg_restore (PostgreSQL) 17.6') {
  const root = await mkdtemp(join(tmpdir(), 'passdown-check-test-'));
  directories.push(root);
  vi.mocked(runTool).mockImplementation(async (_tool, args, options) => {
    expect(options.env).not.toHaveProperty('PGPASSWORD');
    expect(options.env).not.toHaveProperty('GUIDE_OWNER_DATABASE_URL');
    if (args[0] === '--version') {
      options.output!.end(`${version}\n`);
      return;
    }
    expect(args).toEqual(['--list']);
    const path = (options.input as Readable & { path: string }).path;
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect((await stat(join(path, '..'))).mode & 0o777).toBe(0o700);
    const bytes: Buffer[] = [];
    for await (const chunk of options.input!) bytes.push(Buffer.from(chunk));
    if (!Buffer.concat(bytes).toString().startsWith('PGDMP')) throw new Error('not a custom dump');
  });
  return { signal: new AbortController().signal, temporaryRoot: root };
}
describe('offline backup verification', () => {
  it('classifies manifest and tar corruption as validation refusals', async () => {
    const invalidManifest = await archive((m) => {
      (m as { complete: boolean }).complete = false;
    });
    const valid = await archive();
    const damaged = Buffer.from(valid.bytes);
    damaged[0] = 0;
    for (const bytes of [invalidManifest.bytes, damaged, valid.bytes.subarray(0, 700)]) {
      await expect(checkBackup(Readable.from([bytes]), await harness())).rejects.toBeInstanceOf(
        BackupValidationError,
      );
    }
  });
  it('preserves source filesystem errors instead of classifying them as malformed archives', async () => {
    const error = Object.assign(new Error('source read failed'), { code: 'EIO' });
    async function* broken() {
      throw error;
      yield Buffer.alloc(0);
    }
    await expect(checkBackup(Readable.from(broken()), await harness())).rejects.toBe(error);
  });
  it('checks a complete archive with private staging and cleans it after success', async () => {
    const fixture = await archive();
    const options = await harness();
    expect(await checkBackup(Readable.from([fixture.bytes]), options)).toEqual(fixture.manifest);
    expect(await readdir(options.temporaryRoot)).toEqual([]);
    expect(vi.mocked(runTool).mock.calls.map((call) => call[1])).toEqual([
      ['--version'],
      ['--list'],
    ]);
  });
  it.each(['database.dump', 'media.tar'] as const)(
    'rejects %s hash mismatch and removes staging',
    async (name) => {
      const fixture = await archive((manifest) => {
        manifest.files[name].sha256 = '0'.repeat(64);
      });
      const options = await harness();
      await expect(checkBackup(Readable.from([fixture.bytes]), options)).rejects.toThrow();
      expect(await readdir(options.temporaryRoot)).toEqual([]);
    },
  );
  it.each(['count', 'bytes', 'missing'] as const)('rejects inconsistent media %s', async (kind) => {
    const fixture = await archive((m) => {
      if (kind === 'count') m.media.files++;
      else if (kind === 'bytes') m.media.bytes++;
      else m.media.missingAtBackup = [{ workspace, asset }];
    });
    await expect(checkBackup(Readable.from([fixture.bytes]), await harness())).rejects.toThrow();
  });
  it.each([
    'repair-collective/not-an-asset.display.webp',
    `${workspace}/${asset}.400.webp`,
    `${workspace}/nested/${asset}.display.webp`,
  ])('rejects noncanonical media %s', async (name) => {
    const fixture = await archive(undefined, name);
    await expect(checkBackup(Readable.from([fixture.bytes]), await harness())).rejects.toThrow();
  });
  it('rejects reordered, missing, and extra outer members', async () => {
    const { files } = await archive();
    const entries = Object.entries(files).map(([name, bytes]) => ({ name, bytes }));
    for (const changed of [
      [entries[1]!, entries[0]!, ...entries.slice(2)],
      entries.slice(0, 3),
      [...entries, { name: 'extra', bytes: Buffer.alloc(0) }],
    ]) {
      await expect(
        checkBackup(Readable.from([await pack(changed)]), await harness()),
      ).rejects.toThrow();
    }
  });
  it('rejects a changed checksum list', async () => {
    const { files } = await archive();
    files.SHA256SUMS = Buffer.from('0'.repeat(64) + '  database.dump\n');
    await expect(
      checkBackup(
        Readable.from([
          await pack(Object.entries(files).map(([name, bytes]) => ({ name, bytes }))),
        ]),
        await harness(),
      ),
    ).rejects.toThrow();
  });
  it('rejects an older restore tool before listing', async () => {
    const fixture = await archive();
    await expect(
      checkBackup(Readable.from([fixture.bytes]), await harness('pg_restore (PostgreSQL) 16.9')),
    ).rejects.toThrow();
    expect(runTool).toHaveBeenCalledTimes(1);
  });
  it('requires custom dump magic even if a tool would list another format', async () => {
    const fixture = await archive((m, files) => {
      files['database.dump'] = Buffer.from('not-a-custom-dump');
      m.files['database.dump'] = digest(files['database.dump']);
    });
    const options = await harness();
    vi.mocked(runTool).mockImplementation(async (_tool, args, o) => {
      if (args[0] === '--version') o.output!.end('pg_restore (PostgreSQL) 17.6\n');
    });
    await expect(checkBackup(Readable.from([fixture.bytes]), options)).rejects.toThrow();
    expect(await readdir(options.temporaryRoot)).toEqual([]);
  });

  it('cleans private staging when input fails partway through the archive', async () => {
    const fixture = await archive();
    const options = await harness();
    async function* broken() {
      yield fixture.bytes.subarray(0, 600);
      throw new Error('source failed');
    }
    await expect(checkBackup(Readable.from(broken()), options)).rejects.toThrow();
    expect(await readdir(options.temporaryRoot)).toEqual([]);
  });

  it('aborts a blocked source and cleans private staging', async () => {
    const options = await harness();
    const controller = new AbortController();
    const source = new Readable({
      read() {
        controller.abort(new Error('cancelled'));
      },
    });
    await expect(checkBackup(source, { ...options, signal: controller.signal })).rejects.toThrow();
    expect(source.destroyed).toBe(true);
    expect(await readdir(options.temporaryRoot)).toEqual([]);
  });

  it('requires the dump table of contents to be readable and cleans failed staging', async () => {
    const fixture = await archive((m, files) => {
      files['database.dump'] = Buffer.from('PGDMP-broken-table-of-contents');
      m.files['database.dump'] = digest(files['database.dump']);
    });
    const options = await harness();
    vi.mocked(runTool)
      .mockImplementationOnce(async (_tool, _args, o) => {
        o.output!.end('pg_restore (PostgreSQL) 17.6\n');
      })
      .mockRejectedValueOnce(new Error('custom dump table of contents unreadable'));

    await expect(checkBackup(Readable.from([fixture.bytes]), options)).rejects.toThrow();
    expect(await readdir(options.temporaryRoot)).toEqual([]);
  });
});
