import { RestoreRefusal, RuntimeRoleError } from '@guide/database';
import { OperatorFailure, type OperatorCommand } from '../command';
import { BackupValidationError, backupFromDirectory, checkBackup } from '../lifecycle/backup-check';
import { performRestore } from '../lifecycle/restore-flow';

export const restoreCommand: OperatorCommand = {
  name: 'restore',
  summary: 'Restore a trusted backup into an empty installation, or resume an interrupted restore.',
  usage: 'restore [--check | --activate | --discard] [--from DIRECTORY] < backup.tar',
  options: {
    check: { type: 'boolean' },
    activate: { type: 'boolean' },
    discard: { type: 'boolean' },
    from: { type: 'string' },
  },
  validate: ({ options }) =>
    [options.check, options.activate, options.discard].filter(Boolean).length <= 1 &&
    !(options.from && (options.activate || options.discard)),
  needs: ({ options }) => (options.check ? [] : ['owner', 'runtime', 'media']),
  async run(input, context) {
    try {
      if (input.options.check !== true) {
        await performRestore(input, context);
        return;
      }
      const source =
        typeof input.options.from === 'string'
          ? backupFromDirectory(input.options.from, context.signal)
          : context.stdin;
      await checkBackup(source, { signal: context.signal });
    } catch (error) {
      if (error instanceof OperatorFailure) throw error;
      if (error instanceof RuntimeRoleError && error.problem === 'password')
        throw new OperatorFailure(
          'Runtime authentication could not be proven against the postgres database. Check the runtime password and CONNECT permission on postgres, then retry restore --activate. The restore target remains closed.',
        );
      if (error instanceof RestoreRefusal)
        throw new OperatorFailure(error.message, error.problem === 'credential-counts' ? 1 : 4);
      throw new OperatorFailure(
        error instanceof BackupValidationError
          ? 'Restore refused: the archive is invalid or incompatible with this version.'
          : 'Restore could not complete. Check database connectivity, available storage, the installed pg_restore tool, and whether the command was interrupted. Recorded restore state is retained when needed for recovery.',
        error instanceof BackupValidationError ? 4 : 1,
      );
    }
    context.out(
      'Backup archive integrity and compatibility checks passed. No database was restored.',
    );
  },
};
