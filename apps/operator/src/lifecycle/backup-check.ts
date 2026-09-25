import { mediaFileName, parseDisplayMediaFileName } from '@guide/contracts';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { chmod, lstat, mkdtemp, open, readdir, rm, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { readTar, tarArchive, type TarEntry } from './ustar';
import {
  postgresqlMajor,
  validateManifest,
  type BackupManifest,
  type FileDigest,
} from './manifest';
import { runTool } from './run-tool';

const members = ['database.dump', 'media.tar', 'manifest.json', 'SHA256SUMS'] as const;
export class BackupValidationError extends Error {
  constructor() {
    super('Backup archive is invalid or incompatible.');
    this.name = 'BackupValidationError';
  }
}
const refuse = (): never => {
  throw new BackupValidationError();
};

// Preserve transport/read errors verbatim while classifying parser failures.
// Content is lazy, so errors can arise either advancing headers or reading it.
async function* checkedTar(
  source: AsyncIterable<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<TarEntry> {
  const sourceErrors = new Set<unknown>();
  async function* trackedSource() {
    try {
      yield* source;
    } catch (error) {
      sourceErrors.add(error);
      throw error;
    }
  }
  function failed(error: unknown): never {
    signal.throwIfAborted();
    if (sourceErrors.has(error)) throw error;
    return refuse();
  }
  try {
    for await (const entry of readTar(trackedSource())) {
      async function* content() {
        try {
          yield* entry.content;
        } catch (error) {
          failed(error);
        }
      }
      yield { ...entry, content: content() };
    }
  } catch (error) {
    failed(error);
  }
}

/** Offline integrity/compatibility check only; never connects to a database. */
export async function checkBackup(
  source: Readable,
  options: { signal: AbortSignal; pgRestore?: string; temporaryRoot?: string },
): Promise<BackupManifest> {
  options.signal.throwIfAborted();
  const directory = await mkdtemp(join(options.temporaryRoot ?? tmpdir(), 'passdown-check-'));
  try {
    await chmod(directory, 0o700);
    return (
      await receiveBackup(source, {
        signal: options.signal,
        pgRestore: options.pgRestore,
        directory,
      })
    ).manifest;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Receive into caller-owned staging. The caller owns cleanup on failure. */
export async function receiveBackup(
  source: Readable,
  options: { signal: AbortSignal; directory: string; pgRestore?: string },
): Promise<{ manifest: BackupManifest; backupId: string }> {
  options.signal.throwIfAborted();
  const directory = options.directory;
  const info = await lstat(directory);
  if (
    !info.isDirectory() ||
    (info.mode & 0o777) !== 0o700 ||
    (process.getuid && info.uid !== process.getuid()) ||
    (await readdir(directory)).length
  )
    throw new Error('Backup staging requires an empty private directory owned by this user.');
  const abort = () => {
    source.destroy();
  };
  options.signal.addEventListener('abort', abort, { once: true });
  try {
    options.signal.throwIfAborted();
    const digests = new Map<string, FileDigest>();
    const metadata = new Map<string, Buffer>();
    let index = 0;
    for await (const entry of checkedTar(source, options.signal)) {
      options.signal.throwIfAborted();
      if (entry.name !== members[index++]) return refuse();
      const isMetadata = entry.name === 'manifest.json' || entry.name === 'SHA256SUMS';
      if (isMetadata && entry.size > (entry.name === 'manifest.json' ? 16 * 1024 * 1024 : 4096))
        return refuse();
      const hash = createHash('sha256');
      let bytes = 0;
      const chunks: Buffer[] = [];
      const file = await open(join(directory, entry.name), 'wx', 0o600);
      try {
        for await (const chunk of entry.content) {
          options.signal.throwIfAborted();
          bytes += chunk.byteLength;
          if (!Number.isSafeInteger(bytes) || bytes > entry.size) return refuse();
          hash.update(chunk);
          await file.writeFile(chunk);
          if (isMetadata) chunks.push(Buffer.from(chunk));
        }
        if (bytes !== entry.size) return refuse();
        await file.sync();
      } finally {
        await file.close();
      }
      digests.set(entry.name, { bytes, sha256: hash.digest('hex') });
      if (isMetadata) metadata.set(entry.name, Buffer.concat(chunks));
    }
    if (index !== members.length) return refuse();
    let manifest: BackupManifest;
    try {
      manifest = validateManifest(JSON.parse(metadata.get('manifest.json')!.toString('utf8')));
    } catch {
      return refuse();
    }
    for (const name of ['database.dump', 'media.tar'] as const) {
      const actual = digests.get(name)!;
      if (
        actual.bytes !== manifest.files[name].bytes ||
        actual.sha256 !== manifest.files[name].sha256
      )
        return refuse();
    }
    const sums = ['database.dump', 'media.tar', 'manifest.json']
      .map((name) => `${digests.get(name)!.sha256}  ${name}\n`)
      .join('');
    if (!metadata.get('SHA256SUMS')!.equals(Buffer.from(sums))) return refuse();
    let mediaFiles = 0,
      mediaBytes = 0;
    const missing = new Set(
      manifest.media.missingAtBackup.map((item) => mediaFileName(item.workspace, item.asset)),
    );
    for await (const entry of checkedTar(
      createReadStream(join(directory, 'media.tar')),
      options.signal,
    )) {
      options.signal.throwIfAborted();
      if (!parseDisplayMediaFileName(entry.name) || missing.has(entry.name)) return refuse();
      mediaFiles++;
      mediaBytes += entry.size;
      if (!Number.isSafeInteger(mediaFiles) || !Number.isSafeInteger(mediaBytes)) return refuse();
      for await (const _chunk of entry.content) options.signal.throwIfAborted();
    }
    if (mediaFiles !== manifest.media.files || mediaBytes !== manifest.media.bytes) return refuse();
    const dump = await open(join(directory, 'database.dump'), 'r');
    try {
      const magic = Buffer.alloc(5);
      const { bytesRead } = await dump.read(magic, 0, magic.length, 0);
      if (bytesRead !== 5 || magic.toString('ascii') !== 'PGDMP') return refuse();
    } finally {
      await dump.close();
    }
    const env: Record<string, string | undefined> = {
      PATH: process.env.PATH,
      LANG: 'C',
      LC_ALL: 'C',
    };
    const chunks: Buffer[] = [];
    let versionBytes = 0;
    const output = new Writable({
      write(chunk, _encoding, done) {
        versionBytes += chunk.length;
        if (versionBytes > 4096) {
          done(new Error('Unexpected restore tool version output.'));
          return;
        }
        chunks.push(Buffer.from(chunk));
        done();
      },
    });
    const tool = options.pgRestore ?? 'pg_restore';
    await runTool(tool, ['--version'], { env, output, signal: options.signal });
    if (
      postgresqlMajor(Buffer.concat(chunks).toString('utf8').trim()) <
      postgresqlMajor(manifest.database.pgDump)
    )
      return refuse();
    await runTool(tool, ['--list'], {
      env,
      input: createReadStream(join(directory, 'database.dump')),
      signal: options.signal,
    });
    options.signal.throwIfAborted();
    const directoryHandle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
    return { manifest, backupId: digests.get('manifest.json')!.sha256 };
  } finally {
    options.signal.removeEventListener('abort', abort);
  }
}

/** Stream a four-file backup without following links or buffering dump/media. */
export function backupFromDirectory(directory: string, signal: AbortSignal): Readable {
  signal.throwIfAborted();
  async function* archive() {
    const handles: FileHandle[] = [];
    try {
      const info = await lstat(directory);
      if (!info.isDirectory()) throw new Error('Backup source must be a directory.');
      const names = await readdir(directory);
      if (names.length !== members.length || members.some((name) => !names.includes(name)))
        return refuse();
      const entries: TarEntry[] = [];
      for (const name of members) {
        signal.throwIfAborted();
        // NONBLOCK allows rejecting a FIFO without hanging in open().
        const handle = await open(
          join(directory, name),
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        handles.push(handle);
        const info = await handle.stat();
        if (!info.isFile() || !Number.isSafeInteger(info.size)) return refuse();
        async function* content() {
          for await (const chunk of handle.createReadStream({ autoClose: false })) {
            signal.throwIfAborted();
            yield chunk as Buffer;
          }
        }
        entries.push({ name, size: info.size, content: content() });
      }
      for await (const chunk of tarArchive(entries)) {
        signal.throwIfAborted();
        yield chunk;
      }
    } finally {
      await Promise.all(handles.map((handle) => handle.close()));
    }
  }
  const source = Readable.from(archive());
  const abort = () =>
    source.destroy(
      signal.reason instanceof Error ? signal.reason : new Error('Backup source interrupted.'),
    );
  signal.addEventListener('abort', abort, { once: true });
  source.once('close', () => signal.removeEventListener('abort', abort));
  return source;
}
