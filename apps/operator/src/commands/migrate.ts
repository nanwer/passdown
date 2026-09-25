import {
  applyMigrations,
  readMigrationDirectory,
  assertMigrationsMatchBuild,
  defaultLoginEmail,
  ensureDefaultLogin,
  MigrationFailure,
  MigrationValidationError,
  RuntimeRoleError,
} from '@guide/database';
import { renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OperatorFailure, type OperatorCommand } from '../command';

/**
 * The notices a failed migration leaves in the compose file's status volume.
 * The proxy reads only which file exists, to tell visitors and /api/health
 * why web is not answering; web itself was never started (see compose.yaml).
 */
const notices = {
  unchanged: 'migration-failed',
  changed: 'migration-incomplete',
} as const;
const advice = {
  unchanged:
    'Passdown did not start this version, and no data was changed. To go back, put the previous version back in the compose file and redeploy.',
  changed:
    'Passdown did not start this version. Some of the new version’s database changes were applied before the failure, so changing the version back is not enough: fix the cause and redeploy this version (the remaining migrations then continue), or restore the backup made before upgrading with the previous version.',
} as const;

function statusVolume(dir: string, info: (line: string) => void) {
  const failed = (action: string, error: unknown) => {
    const code = (error as { code?: unknown } | null)?.code;
    info(
      `Could not ${action} the migration result in ${dir}${typeof code === 'string' ? ` (${code})` : ''}.`,
    );
  };
  return {
    clear() {
      try {
        for (const name of Object.values(notices)) rmSync(join(dir, name), { force: true });
      } catch (error) {
        failed('clear', error);
      }
    },
    record(kind: keyof typeof notices) {
      // Written beside its name and renamed, so the proxy never sees half a file.
      const path = join(dir, notices[kind]);
      const partial = join(dir, `.${notices[kind]}.${process.pid}`);
      try {
        writeFileSync(partial, `${new Date().toISOString()} ${advice[kind]}\n`, { mode: 0o644 });
        renameSync(partial, path);
      } catch (error) {
        rmSync(partial, { force: true });
        failed('record', error);
      }
    },
  };
}

export const migrateCommand: OperatorCommand = {
  name: 'migrate',
  summary:
    'Apply pending migrations, verify runtime database access, and create the default login in an empty installation. With --status-dir, leave a notice there when they fail.',
  usage: 'migrate [--status-dir DIR]',
  options: { 'status-dir': { type: 'string' } },
  needs: ['owner', 'runtime'],
  async run(input, context) {
    const dir = input.options['status-dir'];
    const status = typeof dir === 'string' ? statusVolume(dir, context.info) : undefined;
    status?.clear();
    let committed = 0;
    try {
      const migrations = readMigrationDirectory(context.migrationsDirectory);
      assertMigrationsMatchBuild(migrations);
      const result = await applyMigrations({
        ownerURL: context.ownerURL!,
        runtimeURL: context.runtimeURL!,
        migrations,
        policy: context.policy,
        onWaiting: () => context.info('Waiting for another migration operation to finish.'),
        onApplying: (name: string) => context.info(`Applying ${name}`),
        onApplied: () => committed++,
      });
      context.out(
        `Migrations are current: ${result.total} recorded, ${result.applied.length} applied now.`,
      );
      // Only in a database with no account and no workspace; a no-op otherwise.
      if ((await ensureDefaultLogin(context.ownerURL!, context.policy)) === 'created')
        context.out(
          `Created the default login ${defaultLoginEmail}. Sign in with it and finish setting up.`,
        );
    } catch (error) {
      const failure = mapped(error);
      if (status) {
        // A migration whose commit could not be confirmed may have applied.
        const uncertain = error instanceof MigrationFailure && error.outcome === 'uncertain';
        const kind = committed === 0 && !uncertain ? 'unchanged' : 'changed';
        status.record(kind);
        if (failure instanceof OperatorFailure)
          throw new OperatorFailure(`${failure.message}\n${advice[kind]}`, failure.exitCode);
        context.info(advice[kind]);
      }
      throw failure;
    }
  },
};

function mapped(error: unknown) {
  if (error instanceof RuntimeRoleError) return new OperatorFailure(error.message, 4);
  if (error instanceof MigrationValidationError) return new OperatorFailure(error.message, 1);
  if (error instanceof MigrationFailure) return new OperatorFailure(error.message, 1);
  return error;
}
