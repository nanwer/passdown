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
import { OperatorFailure, type OperatorCommand } from '../command';
export const migrateCommand: OperatorCommand = {
  name: 'migrate',
  summary:
    'Apply pending migrations, verify runtime database access, and create the default login in an empty installation.',
  usage: 'migrate',
  needs: ['owner', 'runtime'],
  async run(_input, context) {
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
      if (error instanceof RuntimeRoleError) throw new OperatorFailure(error.message, 4);
      if (error instanceof MigrationValidationError) throw new OperatorFailure(error.message, 1);
      if (error instanceof MigrationFailure) throw new OperatorFailure(error.message, 1);
      throw error;
    }
  },
};
