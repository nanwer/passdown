import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ownerDatabaseTarget,
  libpqEnvironment,
  openRestoreSession,
  type RestoreCheckpoint,
} from '@guide/database';
import { OperatorFailure, type OperatorContext, type OperatorInput } from '../command';
import { backupFromDirectory, receiveBackup } from './backup-check';
import { runTool } from './run-tool';
import { verifyMediaFiles, unexpectedMissingMedia } from './verify-files';
import { restoreVerification } from './restore-verification';
import {
  preflightRestoreRoot,
  initializeRestoreState,
  readRestoreState,
  writeRestoreState,
  extractRestoreMedia,
  moveRestoreMedia,
  cleanupRestoreFiles,
  restoreStagingPaths,
  type RestoreFileState,
} from './staging';

/** A conninfo value avoids treating an encoded database name as connection options. */
export function restoreDatabaseArgument(database: string) {
  return `--dbname=dbname='${database.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}
export async function performRestore(input: OperatorInput, context: OperatorContext) {
  const root = context.mediaRoot!;
  const session = await openRestoreSession({
    ownerURL: context.ownerURL!,
    runtimeURL: context.runtimeURL!,
    policy: context.policy,
  });
  let file: RestoreFileState | null = null;
  let createdHere = false;
  try {
    const db = await session.readState();
    file = await readRestoreState(root);
    if (input.options.discard) {
      // A crash before gating or after DB discard may leave only the file mirror.
      // Never reset objects in this case: prove emptiness and unchanged permissions.
      if (!db && file && file.checkpoint !== 'active') {
        const access = await session.preflight();
        if (
          access.public !== file.previousAccess.public ||
          access.runtime !== file.previousAccess.runtime ||
          access.runtimeGrantOption !== file.previousAccess.runtimeGrantOption
        )
          throw new OperatorFailure(
            'Connection permissions changed. The remaining restore files were left untouched.',
            4,
          );
        await cleanupRestoreFiles(root, file.restoreId, { removeMoved: false, removeState: true });
        context.info('Remaining restore staging removed. The empty database was left unchanged.');
        return;
      }
      if (!db || db.checkpoint === 'active' || !file || file.restoreId !== db.restoreId)
        throw new OperatorFailure(
          'This is not a recorded unfinished restore. Nothing was discarded.',
          4,
        );
      await cleanupRestoreFiles(root, file.restoreId, { removeMoved: true, removeState: false });
      await session.discard(file.restoreId, file.previousAccess);
      await cleanupRestoreFiles(root, file.restoreId, { removeMoved: false, removeState: true });
      context.info(
        'Unfinished restore discarded. The target is empty and its original connection permissions are restored.',
      );
      return;
    }
    if (input.options.activate) {
      if (!db && !file) {
        context.info('No unfinished restore needs activation.');
        return;
      }
      // The database is authoritative. A crash after file cleanup leaves only active.
      if (db?.checkpoint === 'active' && !file) {
        await session.finish(db.restoreId);
        context.info('Restore ready. Final cleanup completed.');
        return;
      }
      if (!db || !file || db.restoreId !== file.restoreId || db.backupId !== file.backupId)
        throw new OperatorFailure(
          'Restore state is missing or inconsistent. The target was not activated.',
          4,
        );
      if (db.checkpoint === 'receiving' || db.checkpoint === 'verification-failed')
        throw new OperatorFailure(
          'This restore cannot be activated. Run restore --discard before trying the backup again.',
          4,
        );
      file = { ...file, checkpoint: db.checkpoint };
      if (db.checkpoint !== 'active') await writeRestoreState(root, file);
    } else {
      if (db || file)
        throw new OperatorFailure(
          'An unfinished restore already exists. Use restore --activate or restore --discard.',
          4,
        );
      const previousAccess = await session.preflight();
      await preflightRestoreRoot(root);
      file = {
        version: 1,
        restoreId: randomUUID(),
        backupId: 'pending',
        checkpoint: 'receiving',
        manifest: null,
        previousAccess,
        workspaces: [],
      };
      await initializeRestoreState(root, file);
      createdHere = true;
      await session.beginRestore(file.restoreId, file.backupId, previousAccess);
      // The received archive, including the database dump, stays in this
      // command's own temporary space. The media volume is shared with the web
      // service, which must never be able to read or replace the dump.
      const archive = await mkdtemp(join(tmpdir(), 'passdown-restore-'));
      try {
        await chmod(archive, 0o700);
        context.info('Receiving and checking the backup. Application connections are closed.');
        const receipt = await receiveBackup(
          typeof input.options.from === 'string'
            ? backupFromDirectory(input.options.from, context.signal)
            : context.stdin,
          { directory: archive, signal: context.signal },
        );
        file = { ...file, manifest: receipt.manifest, backupId: receipt.backupId };
        await writeRestoreState(root, file);
        await session.setBackupId(file.restoreId, file.backupId);
        await extractRestoreMedia(
          root,
          file.restoreId,
          createReadStream(join(archive, 'media.tar')),
          { signal: context.signal },
        );
        // Extraction journals workspace ownership before writing; don't overwrite it.
        file = (await readRestoreState(root))!;
        const target = ownerDatabaseTarget(context.ownerURL, context.policy);
        await runTool(
          'pg_restore',
          [
            '--single-transaction',
            '--exit-on-error',
            '--no-owner',
            restoreDatabaseArgument(target.database),
          ],
          {
            env: {
              PATH: process.env.PATH,
              LANG: 'C',
              ...libpqEnvironment(target),
              PGAPPNAME: 'passdown-restore',
              PGPASSFILE: '/dev/null',
              PGOPTIONS: ' ',
            },
            input: createReadStream(join(archive, 'database.dump')),
            signal: context.signal,
          },
        );
      } finally {
        // Resume continues from the loaded database and staged pictures; the
        // archive is never needed again, and a failed attempt starts over.
        await rm(archive, { recursive: true, force: true });
      }
      await session.checkpoint(file.restoreId, 'receiving', 'loaded');
      file = { ...file, checkpoint: 'loaded' };
      await writeRestoreState(root, file);
    }
    if (!file?.manifest)
      throw new OperatorFailure(
        'The recorded restore has no verified manifest. It cannot be activated.',
        4,
      );
    const manifest = file.manifest;
    const advance = async (expected: RestoreCheckpoint, next: RestoreCheckpoint) => {
      await session.checkpoint(file!.restoreId, expected, next);
      file = { ...file!, checkpoint: next };
      await writeRestoreState(root, file);
    };
    if (file.checkpoint === 'loaded') {
      context.signal.throwIfAborted();
      const inventory = await session.inspectRestored(file.restoreId);
      const media = await verifyMediaFiles(
        restoreStagingPaths(root, file.restoreId).media,
        inventory.assets,
        { checksums: true, signal: context.signal },
      );
      const report = restoreVerification(manifest, inventory, media);
      if (!report.ok) {
        file = { ...file, verificationReport: report };
        await writeRestoreState(root, file);
        await advance('loaded', 'verification-failed');
        throw new OperatorFailure(
          'Restored data or pictures failed verification. Application access remains closed. Run restore --discard.',
          1,
        );
      }
      await advance('loaded', 'verified');
    }
    if (file.checkpoint === 'verified') {
      context.signal.throwIfAborted();
      const report = await session.applyCredentialPolicy(
        file.restoreId,
        manifest.credentials,
        manifest.snapshotAt,
      );
      file = { ...file, checkpoint: 'access-reset', accessReport: report };
      await writeRestoreState(root, file);
    }
    if (file.checkpoint === 'access-reset') {
      context.signal.throwIfAborted();
      await moveRestoreMedia(root, file.restoreId);
      const inventory = await session.inspectRestored(file.restoreId);
      const media = await verifyMediaFiles(root, inventory.assets, { signal: context.signal });
      if (
        media.damaged.length ||
        unexpectedMissingMedia(media.missing, manifest.media.missingAtBackup).length ||
        inventory.dangling.length
      )
        throw new OperatorFailure(
          'Restored picture files are incomplete. Access remains closed; inspect the files before resuming.',
        );
      await advance('access-reset', 'media-moved');
    }
    if (file.checkpoint === 'media-moved') {
      context.signal.throwIfAborted();
      await session.activate(file.restoreId);
      file = { ...file, checkpoint: 'active' };
      await writeRestoreState(root, file);
    }
    if (file.checkpoint === 'active') {
      const report = await session.accessReport(manifest.snapshotAt);
      context.info(
        `Access as of the backup snapshot (${manifest.snapshotAt}):\n${JSON.stringify(report, null, 2)}`,
      );
      context.info(
        'Everyone must sign in again. Pending invitations and reset links are cancelled. Accounts, passwords and permissions reflect the snapshot: review access before announcing this installation.',
      );
      if (manifest.media.missingAtBackup.length)
        context.info(
          `Warning: ${manifest.media.missingAtBackup.length} pictures were already missing when this backup was made. Run verify-media --json for details.`,
        );
      await cleanupRestoreFiles(root, file.restoreId, { removeMoved: false, removeState: true });
      await session.finish(file.restoreId);
      context.info(
        'Restore ready. Review access, then start the installation with docker compose up -d.',
      );
    }
  } catch (error) {
    // Only a new receiving attempt is rolled back automatically. A committed
    // loaded checkpoint is retained for resume; uncertain state is never guessed.
    if (createdHere && file) {
      try {
        const state = await session.readState();
        if (state?.restoreId === file.restoreId && state.checkpoint === 'receiving') {
          const current = (await readRestoreState(root)) ?? file;
          await cleanupRestoreFiles(root, current.restoreId, {
            removeMoved: true,
            removeState: false,
          });
          await session.discard(current.restoreId, current.previousAccess);
          await cleanupRestoreFiles(root, current.restoreId, {
            removeMoved: false,
            removeState: true,
          });
        } else if (!state)
          await cleanupRestoreFiles(root, file.restoreId, {
            removeMoved: false,
            removeState: true,
          });
      } catch {
        context.info(
          'Restore cleanup could not finish. Keep the recorded state and use restore --discard after resolving the connection or storage problem.',
        );
      }
    }
    throw error;
  } finally {
    await session.release();
  }
}
