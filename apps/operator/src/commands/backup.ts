import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdtemp, open, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  libpqEnvironment,
  openBackupSnapshot,
  ownerDatabaseTarget,
  LifecyclePreconditionError,
  expectedMigrations,
} from '@guide/database';
import { mediaFileName, type MediaFileMetadata } from '@guide/contracts';
import packageInfo from '../../../../package.json';
import { OperatorFailure, type OperatorCommand } from '../command';
import { runTool } from '../lifecycle/run-tool';
import { tarArchive, tarSize, type TarEntry } from '../lifecycle/ustar';
import { openVerifiedDisplayFile, verifyMediaFiles } from '../lifecycle/verify-files';
import {
  validateManifest,
  postgresqlMajor,
  type BackupManifest,
  type FileDigest,
} from '../lifecycle/manifest';

export async function digestFile(path: string, signal?: AbortSignal): Promise<FileDigest> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path, { signal })) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { bytes, sha256: hash.digest('hex') };
}
async function syncFile(path: string) {
  const handle = await open(path, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}
function bufferEntry(name: string, buffer: Buffer): TarEntry {
  return { name, size: buffer.length, content: Readable.from([buffer]) };
}
async function* mediaEntries(root: string, assets: MediaFileMetadata[], signal: AbortSignal) {
  for (const asset of assets) {
    signal.throwIfAborted();
    const handle = await openVerifiedDisplayFile(root, asset, { signal });
    const hash = createHash('sha256');
    try {
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        signal.throwIfAborted();
        hash.update(chunk);
        yield chunk;
      }
      if (hash.digest('hex') !== asset.sha256)
        throw new OperatorFailure(
          'A picture changed during backup. No complete backup was produced.',
          4,
        );
    } finally {
      await handle.close();
    }
  }
}
export const backupCommand: OperatorCommand = {
  name: 'backup',
  summary:
    'Back up the database and original pictures together; environment secrets and sessions are excluded.',
  usage: 'backup [--output <directory>] [--allow-missing-media]',
  needs: ['owner', 'media'],
  options: { output: { type: 'string' }, 'allow-missing-media': { type: 'boolean' } },
  async run(input, context) {
    const target = ownerDatabaseTarget(context.ownerURL, context.policy);
    const startedAt = new Date().toISOString();
    const env = {
      PATH: process.env.PATH,
      LANG: 'C',
      ...libpqEnvironment(target),
      PGAPPNAME: 'passdown-backup',
      PGPASSFILE: '/dev/null',
      PGOPTIONS: ' ',
    };
    let version = '';
    await runTool('pg_dump', ['--version'], {
      env,
      signal: context.signal,
      output: new Writable({
        write(chunk, _enc, done) {
          if (version.length < 1024) version += chunk.toString();
          done();
        },
      }),
    });
    const pgDump = version.trim();
    const snapshot = await openBackupSnapshot(target).catch((error) => {
      if (error instanceof LifecyclePreconditionError) throw new OperatorFailure(error.message, 4);
      throw error;
    });
    let spool: string | undefined, incomplete: string | undefined;
    try {
      if (postgresqlMajor(pgDump) !== postgresqlMajor(snapshot.serverVersion))
        throw new OperatorFailure(
          'pg_dump and the database must have the same PostgreSQL major version.',
          4,
        );
      if (JSON.stringify(snapshot.migrations) !== JSON.stringify(expectedMigrations()))
        throw new OperatorFailure(
          'The database migrations do not match this build. Use the matching operator version.',
          4,
        );
      if (snapshot.dangling.length)
        throw new OperatorFailure(
          'A stored picture reference has no matching picture record. Run verify-media --json and report the affected references.',
          4,
        );
      const verification = await verifyMediaFiles(context.mediaRoot!, snapshot.assets, {
        checksums: true,
        signal: context.signal,
      });
      if (verification.damaged.length)
        throw new OperatorFailure(
          'Picture verification found damaged or unsafe files. Run verify-media --checksums --json.',
          4,
        );
      if (verification.missing.length && !input.options['allow-missing-media'])
        throw new OperatorFailure(
          'Pictures are missing. Run verify-media --json; use --allow-missing-media only to record those omissions explicitly.',
          4,
        );
      const missing = new Set(verification.missing.map((a) => `${a.workspace}/${a.asset}`));
      const assets = snapshot.assets.filter((a) => !missing.has(`${a.workspace}/${a.asset}`));
      spool = await mkdtemp(join(tmpdir(), 'passdown-dump-'));
      await chmod(spool, 0o700);
      const dumpPath = join(spool, 'database.dump');
      context.info('Creating a consistent database snapshot…');
      await runTool(
        'pg_dump',
        [
          '--format=custom',
          `--snapshot=${snapshot.id}`,
          '--lock-wait-timeout=120000',
          '--exclude-table-data=public.auth_session',
          '--exclude-table-data=public.auth_verification',
          '--exclude-table-data=app.rate_limit',
        ],
        {
          env,
          signal: context.signal,
          output: createWriteStream(dumpPath, { flags: 'wx', mode: 0o600 }),
        },
      );
      await syncFile(dumpPath);
      await snapshot.release();
      const dumpDigest = await digestFile(dumpPath, context.signal);
      const mediaHash = createHash('sha256');
      let mediaBytes = 0;
      function* pictures(): Generator<TarEntry> {
        for (const asset of assets)
          yield {
            name: mediaFileName(asset.workspace, asset.asset),
            size: asset.bytes,
            content: mediaEntries(context.mediaRoot!, [asset], context.signal),
          };
      }
      async function* media() {
        for await (const chunk of tarArchive(pictures())) {
          context.signal.throwIfAborted();
          mediaHash.update(chunk);
          mediaBytes += chunk.length;
          yield chunk;
        }
      }
      function* members(): Generator<TarEntry> {
        yield {
          name: 'database.dump',
          size: dumpDigest.bytes,
          content: createReadStream(dumpPath),
        };
        yield { name: 'media.tar', size: tarSize(assets.map((a) => a.bytes)), content: media() };
        const mediaDigest = { bytes: mediaBytes, sha256: mediaHash.digest('hex') };
        const manifest: BackupManifest = {
          format: 'passdown-backup/1',
          complete: true,
          createdBy: {
            passdown: packageInfo.version,
            revision: process.env.PASSDOWN_REVISION ?? 'unknown',
          },
          startedAt,
          snapshotAt: snapshot.snapshotAt,
          completedAt: new Date().toISOString(),
          database: { name: snapshot.databaseName, server: snapshot.serverVersion, pgDump },
          migrations: snapshot.migrations,
          counts: snapshot.counts,
          excludedData: ['public.auth_session', 'public.auth_verification', 'app.rate_limit'],
          credentials: snapshot.credentials,
          media: {
            files: assets.length,
            bytes: assets.reduce((n, a) => n + a.bytes, 0),
            missingAtBackup: verification.missing,
            renditionsIncluded: false,
          },
          files: { 'database.dump': dumpDigest, 'media.tar': mediaDigest },
        };
        validateManifest(manifest);
        const json = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
        yield bufferEntry('manifest.json', json);
        yield bufferEntry(
          'SHA256SUMS',
          Buffer.from(
            `${dumpDigest.sha256}  database.dump\n${mediaDigest.sha256}  media.tar\n${createHash('sha256').update(json).digest('hex')}  manifest.json\n`,
          ),
        );
      }
      if (typeof input.options.output === 'string') {
        const parent = input.options.output;
        if (!(await stat(parent)).isDirectory())
          throw new OperatorFailure('The backup output directory must already exist.', 4);
        incomplete = await mkdtemp(join(parent, '.incomplete-passdown-'));
        await chmod(incomplete, 0o700);
        for (const entry of members()) {
          const path = join(incomplete, entry.name);
          await pipeline(
            Readable.from(entry.content),
            createWriteStream(path, { flags: 'wx', mode: 0o600 }),
            { signal: context.signal },
          );
          if ((await stat(path)).size !== entry.size)
            throw new OperatorFailure('Backup member size changed.', 4);
          await syncFile(path);
        }
        const final = join(
          parent,
          `passdown-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`,
        );
        await rename(incomplete, final);
        incomplete = undefined;
        context.info(`Backup completed: ${final}`);
      } else
        await pipeline(Readable.from(tarArchive(members())), context.stdout, {
          signal: context.signal,
        });
      context.info(
        `Backup complete: ${assets.length} pictures; ${verification.missing.length} missing at snapshot time. Store this backup privately.`,
      );
    } finally {
      try {
        await snapshot.release();
      } finally {
        try {
          if (spool) await rm(spool, { recursive: true, force: true });
        } finally {
          if (incomplete) await rm(incomplete, { recursive: true, force: true });
        }
      }
    }
  },
};
