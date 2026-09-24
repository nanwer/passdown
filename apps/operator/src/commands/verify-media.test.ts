import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { verifyMediaRows } from '@guide/database';
import { mediaFileName, type MediaFileMetadata } from '@guide/contracts';
import { runCli, type OperatorIO } from '../cli';
import { verifyMediaCommand } from './verify-media';
import { commands } from './index';
vi.mock('@guide/database', async (load) => ({
  ...(await load<typeof import('@guide/database')>()),
  verifyMediaRows: vi.fn(),
}));
let root: string;
const asset: MediaFileMetadata = {
  workspace: 'workshop',
  asset: '12345678-1234-4234-8234-123456789abc',
  bytes: 7,
  sha256: createHash('sha256').update('picture').digest('hex'),
};
const dangling = {
  workspace: 'workshop',
  asset: '12345678-1234-4234-8234-123456789def',
  source: 'guide-document' as const,
  sourceId: '12345678-1234-4234-8234-123456789aaa',
};
function harness() {
  const out: string[] = [],
    info: string[] = [];
  const io: OperatorIO = {
    out: (s) => out.push(s),
    info: (s) => info.push(s),
    stdin: Readable.from([]),
    stdout: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
    signal: new AbortController().signal,
    migrationsDirectory: 'unused',
    env: {
      GUIDE_OWNER_DATABASE_URL: 'postgres://owner:password@127.0.0.1/app',
      GUIDE_MEDIA_ROOT: root,
    },
  };
  return { out, info, io };
}
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'passdown-verify-command-')));
  await mkdir(join(root, 'workshop'));
  await writeFile(join(root, mediaFileName(asset.workspace, asset.asset)), 'picture');
  vi.mocked(verifyMediaRows).mockReset();
  vi.mocked(verifyMediaRows).mockResolvedValue({ assets: [asset], dangling: [], references: [] });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
it('registers verify-media and writes a successful human report only to stderr', async () => {
  expect(commands).toContain(verifyMediaCommand);
  const h = harness();
  expect(await runCli(['verify-media'], h.io, commands)).toBe(0);
  expect(h.out).toEqual([]);
  expect(h.info.join('\n')).toContain('1 asset checked');
  expect(vi.mocked(verifyMediaRows).mock.calls[0]?.[0]).toMatchObject({
    database: 'app',
    user: 'owner',
  });
});
it('prints JSON on stdout and leaves ordinary orphan displays informational', async () => {
  const orphan = mediaFileName('workshop', dangling.asset);
  await writeFile(join(root, orphan), 'orphan');
  const h = harness();
  expect(await runCli(['verify-media', '--json', '--checksums'], h.io, [verifyMediaCommand])).toBe(
    0,
  );
  expect(h.info).toEqual([]);
  expect(JSON.parse(h.out[0]!)).toMatchObject({
    ok: true,
    checked: 1,
    checksums: true,
    missing: [],
    damaged: [],
    dangling: [],
    orphanFiles: [orphan],
  });
});
it('exits one and reports missing files with their uses', async () => {
  await rm(join(root, mediaFileName(asset.workspace, asset.asset)));
  const usage = { ...dangling, asset: asset.asset };
  vi.mocked(verifyMediaRows).mockResolvedValue({
    assets: [asset],
    dangling: [],
    references: [usage],
  });
  const h = harness();
  expect(await runCli(['verify-media', '--json'], h.io, [verifyMediaCommand])).toBe(1);
  expect(JSON.parse(h.out[0]!)).toMatchObject({
    ok: false,
    missing: [{ workspace: asset.workspace, asset: asset.asset, uses: [usage] }],
  });
});
it('only checks same-size content corruption when checksums are requested', async () => {
  await writeFile(join(root, mediaFileName(asset.workspace, asset.asset)), 'changed');
  const normal = harness();
  expect(await runCli(['verify-media', '--quiet'], normal.io, [verifyMediaCommand])).toBe(0);
  expect(normal.info).toEqual([]);
  const hashed = harness();
  expect(
    await runCli(['verify-media', '--checksums', '--quiet'], hashed.io, [verifyMediaCommand]),
  ).toBe(1);
  expect(hashed.info.join('\n')).toContain('checksum');
  expect(hashed.out).toEqual([]);
});
it('dangling document references fail even when all stored files are healthy', async () => {
  vi.mocked(verifyMediaRows).mockResolvedValue({
    assets: [asset],
    dangling: [dangling],
    references: [dangling],
  });
  const h = harness();
  expect(await runCli(['verify-media', '--json', '--quiet'], h.io, [verifyMediaCommand])).toBe(1);
  expect(JSON.parse(h.out[0]!)).toMatchObject({ ok: false, dangling: [dangling] });
});
it('refuses configuration and arguments before touching the database', async () => {
  const h = harness();
  delete h.io.env.GUIDE_MEDIA_ROOT;
  expect(await runCli(['verify-media'], h.io, [verifyMediaCommand])).toBe(3);
  expect(await runCli(['verify-media', '--wrong'], h.io, [verifyMediaCommand])).toBe(2);
  expect(verifyMediaRows).not.toHaveBeenCalled();
});
