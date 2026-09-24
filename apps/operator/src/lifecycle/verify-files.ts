import { createHash } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, open, readdir, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import {
  mediaFileName,
  parseDisplayMediaFileName,
  type MediaFileIdentity,
  type MediaFileMetadata,
} from '@guide/contracts';

export type MediaDamageReason = 'size' | 'checksum' | 'unsafe' | 'unreadable';
export type MediaFileVerification = {
  checked: number;
  missing: MediaFileIdentity[];
  damaged: (MediaFileIdentity & { reason: MediaDamageReason })[];
  /** Unreferenced canonical displays only; regenerable renditions are omitted. */
  orphanFiles: string[];
};
type VerificationCode =
  | 'invalid-metadata'
  | 'unsafe-root'
  | 'unreadable-root'
  | 'missing'
  | Exclude<MediaDamageReason, 'checksum'>;
const messages: Record<VerificationCode, string> = {
  'invalid-metadata': 'Media metadata contains an invalid or duplicate file reference.',
  'unsafe-root': 'The media root must be a directory, not a symbolic link.',
  'unreadable-root': 'The media root could not be inspected.',
  missing: 'The display file is missing.',
  unsafe: 'The display path is not a stable regular file inside its workspace.',
  size: 'The display file size does not match its recorded size.',
  unreadable: 'The display file could not be read consistently.',
};
export class MediaVerificationError extends Error {
  constructor(readonly code: VerificationCode) {
    super(messages[code]);
    this.name = 'MediaVerificationError';
  }
}
const identity = ({ workspace, asset }: MediaFileIdentity): MediaFileIdentity => ({
  workspace,
  asset,
});
function nameOf(asset: MediaFileIdentity): string {
  try {
    return mediaFileName(asset.workspace, asset.asset);
  } catch {
    throw new MediaVerificationError('invalid-metadata');
  }
}
function validate(asset: MediaFileMetadata): string {
  const name = nameOf(asset);
  if (
    !Number.isSafeInteger(asset.bytes) ||
    asset.bytes < 0 ||
    typeof asset.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(asset.sha256) ||
    asset.sha256.length !== 64
  )
    throw new MediaVerificationError('invalid-metadata');
  return name;
}
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code;
const sameObject = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino;
const sameContents = (a: Stats, b: Stats) =>
  sameObject(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
async function directory(path: string, root = false): Promise<Stats> {
  let stat: Stats;
  try {
    stat = await lstat(path);
  } catch (error) {
    throw new MediaVerificationError(
      errorCode(error) === 'ENOENT' ? 'missing' : root ? 'unreadable-root' : 'unreadable',
    );
  }
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new MediaVerificationError(root ? 'unsafe-root' : 'unsafe');
  return stat;
}

/**
 * Open a pinned display file for verification or backup; caller must close it.
 * Never follow a workspace/file symlink. Recheck path identities after opening
 * so a replacement between lstat and open is refused before any bytes are read.
 */
export async function openVerifiedDisplayFile(
  root: string,
  asset: MediaFileMetadata,
  options: { signal?: AbortSignal } = {},
): Promise<FileHandle> {
  const name = validate(asset);
  options.signal?.throwIfAborted();
  const rootBefore = await directory(root, true);
  const workspacePath = join(root, asset.workspace);
  const workspaceBefore = await directory(workspacePath);
  const path = join(root, name);
  let handle: FileHandle | undefined;
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink()) throw new MediaVerificationError('unsafe');
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const opened = await handle.stat();
    const [after, workspaceAfter, rootAfter] = await Promise.all([
      lstat(path),
      directory(workspacePath),
      directory(root, true),
    ]);
    if (
      !opened.isFile() ||
      !after.isFile() ||
      after.isSymbolicLink() ||
      !sameContents(before, opened) ||
      !sameContents(opened, after) ||
      !sameObject(workspaceBefore, workspaceAfter) ||
      !sameObject(rootBefore, rootAfter)
    )
      throw new MediaVerificationError('unsafe');
    if (opened.size !== asset.bytes) throw new MediaVerificationError('size');
    options.signal?.throwIfAborted();
    return handle;
  } catch (error) {
    await handle?.close();
    options.signal?.throwIfAborted();
    if (error instanceof MediaVerificationError) throw error;
    throw new MediaVerificationError(
      errorCode(error) === 'ENOENT'
        ? 'missing'
        : errorCode(error) === 'ELOOP'
          ? 'unsafe'
          : 'unreadable',
    );
  }
}

async function orphanDisplays(root: string, expected: ReadonlySet<string>, signal?: AbortSignal) {
  const orphans: string[] = [];
  try {
    for (const workspace of await readdir(root, { withFileTypes: true })) {
      signal?.throwIfAborted();
      if (!workspace.isDirectory() || workspace.isSymbolicLink()) continue;
      const workspacePath = join(root, workspace.name);
      const before = await directory(workspacePath);
      const entries = await readdir(workspacePath, { withFileTypes: true });
      const after = await directory(workspacePath);
      if (!sameObject(before, after)) throw new MediaVerificationError('unreadable-root');
      for (const file of entries) {
        const name = `${workspace.name}/${file.name}`;
        if (file.isFile() && parseDisplayMediaFileName(name) && !expected.has(name))
          orphans.push(name);
      }
    }
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof MediaVerificationError) throw error;
    throw new MediaVerificationError('unreadable-root');
  }
  return orphans.sort();
}

/** SQL-free verification of the display files described by one asset snapshot. */
export async function verifyMediaFiles(
  root: string,
  assets: readonly MediaFileMetadata[],
  options: { checksums?: boolean; signal?: AbortSignal } = {},
): Promise<MediaFileVerification> {
  options.signal?.throwIfAborted();
  const expected = new Set<string>();
  for (const asset of assets) {
    const name = validate(asset);
    if (expected.has(name)) throw new MediaVerificationError('invalid-metadata');
    expected.add(name);
  }
  const ordered = [...assets].sort((a, b) =>
    nameOf(a) < nameOf(b) ? -1 : nameOf(a) > nameOf(b) ? 1 : 0,
  );
  const report: MediaFileVerification = {
    checked: assets.length,
    missing: [],
    damaged: [],
    orphanFiles: [],
  };
  try {
    await directory(root, true);
  } catch (error) {
    if (error instanceof MediaVerificationError && error.code === 'missing') {
      report.missing = ordered.map(identity);
      return report;
    }
    throw error;
  }
  for (const asset of ordered) {
    options.signal?.throwIfAborted();
    let handle: FileHandle | undefined;
    try {
      handle = await openVerifiedDisplayFile(root, asset, options);
      if (options.checksums) {
        const before = await handle.stat();
        const hash = createHash('sha256');
        const buffer = Buffer.allocUnsafe(64 * 1024);
        for (;;) {
          options.signal?.throwIfAborted();
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          hash.update(buffer.subarray(0, bytesRead));
        }
        if (!sameContents(before, await handle.stat()))
          throw new MediaVerificationError('unreadable');
        if (hash.digest('hex') !== asset.sha256)
          report.damaged.push({ ...identity(asset), reason: 'checksum' });
      }
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof MediaVerificationError && error.code === 'missing')
        report.missing.push(identity(asset));
      else if (
        error instanceof MediaVerificationError &&
        ['size', 'unsafe', 'unreadable'].includes(error.code)
      )
        report.damaged.push({ ...identity(asset), reason: error.code as MediaDamageReason });
      else if (error instanceof MediaVerificationError) throw error;
      else report.damaged.push({ ...identity(asset), reason: 'unreadable' });
    } finally {
      await handle?.close();
    }
  }
  report.orphanFiles = await orphanDisplays(root, expected, options.signal);
  return report;
}

/** Restore may excuse only missing pairs recorded as absent when backed up. */
export function unexpectedMissingMedia(
  missing: readonly MediaFileIdentity[],
  allowed: readonly MediaFileIdentity[],
): MediaFileIdentity[] {
  const accepted = new Set(allowed.map(nameOf));
  return missing.filter((asset) => !accepted.has(nameOf(asset))).map(identity);
}
