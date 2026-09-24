import { OperatorFailure, type OperatorCommand } from '../command';
import { BackupValidationError, checkBackup } from '../lifecycle/backup-check';

export const restoreCommand: OperatorCommand = {
  name: 'restore',
  summary: 'Check a backup archive offline. Database restore is not available yet.',
  usage: 'restore --check < backup.tar',
  options: { check: { type: 'boolean' } },
  needs: [],
  async run(input, context) {
    if (input.options.check !== true)
      throw new OperatorFailure(
        'Database restore is not available yet. Use restore --check to verify an archive offline.',
        4,
      );
    try {
      await checkBackup(context.stdin, { signal: context.signal });
    } catch (error) {
      throw new OperatorFailure(
        error instanceof BackupValidationError
          ? 'Backup check refused: the archive is invalid or incompatible with this version.'
          : 'Backup check could not complete. Check available storage, the installed pg_restore tool, and whether the command was interrupted.',
        error instanceof BackupValidationError ? 4 : 1,
      );
    }
    context.out(
      'Backup archive integrity and compatibility checks passed. No database was restored.',
    );
  },
};
