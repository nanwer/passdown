import { afterEach, beforeEach, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mediaFileName, type MediaFileMetadata } from '@guide/contracts';
import {
  verifyMediaFiles,
  unexpectedMissingMedia,
  openVerifiedDisplayFile,
  MediaVerificationError,
} from './verify-files';
let temp: string;
let root: string;
const id = (n: number) => `12345678-1234-4234-8234-${String(n).padStart(12, '0')}`;
const metadata = (workspace = 'workshop', n = 1, content = 'picture'): MediaFileMetadata => ({
  workspace,
  asset: id(n),
  bytes: Buffer.byteLength(content),
  sha256: createHash('sha256').update(content).digest('hex'),
});
async function put(asset: MediaFileMetadata, bytes = 'picture') {
  const dir = join(root, asset.workspace);
  await mkdir(dir, { recursive: true });
  await writeFile(join(root, mediaFileName(asset.workspace, asset.asset)), bytes);
}
beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), 'passdown-media-test-')));
  root = join(temp, 'media');
  await mkdir(root);
});
afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});
it('checks sizes, optional hashes, and informational orphan display files', async () => {
  const good = metadata(),
    short = metadata('workshop', 2),
    altered = metadata('workshop', 3),
    absent = metadata('workshop', 4),
    orphan = metadata('workshop', 5);
  await put(good);
  await put(short, 'short');
  await put(altered, 'changed');
  await put(orphan);
  await writeFile(join(root, mediaFileName('workshop', id(6), 'w400')), 'cached');
  const rows = [good, short, altered, absent];
  expect(await verifyMediaFiles(root, rows)).toEqual({
    checked: 4,
    missing: [{ workspace: 'workshop', asset: id(4) }],
    damaged: [{ workspace: 'workshop', asset: id(2), reason: 'size' }],
    orphanFiles: [mediaFileName('workshop', id(5))],
  });
  expect((await verifyMediaFiles(root, rows, { checksums: true })).damaged).toEqual([
    { workspace: 'workshop', asset: id(2), reason: 'size' },
    { workspace: 'workshop', asset: id(3), reason: 'checksum' },
  ]);
});
it('returns a readable verified handle that the caller closes', async () => {
  const asset = metadata();
  await put(asset);
  const handle = await openVerifiedDisplayFile(root, asset);
  try {
    expect(await handle.readFile('utf8')).toBe('picture');
  } finally {
    await handle.close();
  }
});
it('never follows a display symlink or accepts a directory as a display file', async () => {
  const a = metadata(),
    b = metadata('workshop', 2);
  await mkdir(join(root, 'workshop'));
  await writeFile(join(temp, 'outside'), 'picture');
  await symlink(join(temp, 'outside'), join(root, mediaFileName(a.workspace, a.asset)));
  await mkdir(join(root, mediaFileName(b.workspace, b.asset)));
  expect((await verifyMediaFiles(root, [a, b], { checksums: true })).damaged).toEqual([
    { workspace: 'workshop', asset: a.asset, reason: 'unsafe' },
    { workspace: 'workshop', asset: b.asset, reason: 'unsafe' },
  ]);
  await expect(openVerifiedDisplayFile(root, a)).rejects.toMatchObject({ code: 'unsafe' });
});
it('refuses a symlink workspace and a symlink root without reading their target', async () => {
  const asset = metadata();
  await mkdir(join(temp, 'outside'));
  await symlink(join(temp, 'outside'), join(root, 'workshop'));
  expect((await verifyMediaFiles(root, [asset])).damaged).toEqual([
    { workspace: 'workshop', asset: asset.asset, reason: 'unsafe' },
  ]);
  const linked = join(temp, 'linked');
  await symlink(root, linked);
  await expect(verifyMediaFiles(linked, [asset])).rejects.toMatchObject({ code: 'unsafe-root' });
});
it('treats an absent media root as missing files and supports cancellation', async () => {
  await rm(root, { recursive: true });
  const a = metadata();
  expect((await verifyMediaFiles(root, [a])).missing).toEqual([
    { workspace: a.workspace, asset: a.asset },
  ]);
  await expect(verifyMediaFiles(root, [a], { signal: AbortSignal.abort() })).rejects.toMatchObject({
    name: 'AbortError',
  });
});
it('refuses invalid or duplicate metadata before filesystem reads', async () => {
  const a = metadata();
  for (const invalid of [
    { ...a, workspace: '../outside' },
    { ...a, bytes: -1 },
    { ...a, bytes: Number.MAX_SAFE_INTEGER + 1 },
    { ...a, sha256: 'bad' },
  ])
    await expect(verifyMediaFiles(root, [invalid])).rejects.toBeInstanceOf(MediaVerificationError);
  await expect(verifyMediaFiles(root, [a, a])).rejects.toMatchObject({ code: 'invalid-metadata' });
});
it('tolerates only the exact missing workspace and asset pairs', () => {
  const missing = [
    { workspace: 'one', asset: id(1) },
    { workspace: 'two', asset: id(1) },
    { workspace: 'one', asset: id(2) },
  ];
  expect(unexpectedMissingMedia(missing, [{ workspace: 'one', asset: id(1) }])).toEqual(
    missing.slice(1),
  );
  expect(unexpectedMissingMedia(missing, missing)).toEqual([]);
});
