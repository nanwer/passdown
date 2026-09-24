import { ownerDatabaseTarget, verifyMediaRows, type MediaReference } from '@guide/database';
import { mediaFileName, type MediaFileIdentity } from '@guide/contracts';
import { OperatorFailure, type OperatorCommand } from '../command';
import {
  MediaVerificationError,
  verifyMediaFiles,
  type MediaFileVerification,
} from '../lifecycle/verify-files';

export type VerifyMediaReport = Omit<MediaFileVerification, 'missing' | 'damaged'> & {
  ok: boolean;
  checksums: boolean;
  missing: (MediaFileIdentity & { uses: MediaReference[] })[];
  damaged: (MediaFileVerification['damaged'][number] & { uses: MediaReference[] })[];
  dangling: MediaReference[];
};

export const verifyMediaCommand: OperatorCommand = {
  name: 'verify-media',
  summary: 'Check stored picture files and references without changing them.',
  usage: 'verify-media [--checksums] [--json] [--quiet]',
  options: {
    checksums: { type: 'boolean' },
    json: { type: 'boolean' },
    quiet: { type: 'boolean' },
  },
  needs: ['owner', 'media'],
  async run(input, context) {
    const checksums = input.options.checksums === true;
    let report: VerifyMediaReport;
    try {
      const rows = await verifyMediaRows(ownerDatabaseTarget(context.ownerURL, context.policy));
      context.signal.throwIfAborted();
      const files = await verifyMediaFiles(context.mediaRoot!, rows.assets, {
        checksums,
        signal: context.signal,
      });
      const uses = ({ workspace, asset }: MediaFileIdentity) =>
        rows.references.filter((ref) => ref.workspace === workspace && ref.asset === asset);
      report = {
        ...files,
        ok: files.missing.length === 0 && files.damaged.length === 0 && rows.dangling.length === 0,
        checksums,
        missing: files.missing.map((file) => ({ ...file, uses: uses(file) })),
        damaged: files.damaged.map((file) => ({ ...file, uses: uses(file) })),
        dangling: rows.dangling,
      };
    } catch (error) {
      if (context.signal.aborted) throw new OperatorFailure('Media verification was interrupted.');
      if (error instanceof MediaVerificationError) throw new OperatorFailure(error.message);
      throw error;
    }
    if (input.options.json) context.out(JSON.stringify(report));
    else {
      if (!input.options.quiet)
        context.info(
          `Media verification: ${report.checked} ${report.checked === 1 ? 'asset' : 'assets'} checked, ${report.missing.length} missing, ${report.damaged.length} damaged, ${report.dangling.length} dangling, ${report.orphanFiles.length} orphan files.`,
        );
      for (const file of [...report.missing, ...report.damaged]) {
        const issue = 'reason' in file ? file.reason : 'missing';
        context.info(`${mediaFileName(file.workspace, file.asset)}: ${issue}.`);
        for (const use of file.uses)
          context.info(`  Used by ${use.source} ${JSON.stringify(use.sourceId)}.`);
      }
      for (const ref of report.dangling)
        context.info(
          `Dangling picture ${JSON.stringify([ref.workspace, ref.asset])} in ${ref.source} ${JSON.stringify(ref.sourceId)}.`,
        );
      if (!input.options.quiet)
        for (const file of report.orphanFiles) context.info(`Unreferenced display file: ${file}.`);
    }
    if (!report.ok) throw new OperatorFailure('Media verification found problems.');
  },
};
