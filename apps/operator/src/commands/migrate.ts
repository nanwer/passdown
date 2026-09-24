import {
  applyMigrations,
  readMigrationDirectory,
  assertMigrationsMatchBuild,
  MigrationFailure,
  MigrationValidationError,
  RuntimeRoleError,
} from '@guide/database';
import { OperatorFailure, type OperatorCommand } from '../command';
export const migrateCommand: OperatorCommand = {
  name: 'migrate',
  summary: 'Apply pending migrations and verify runtime database access.',
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
    } catch (error) {
      if (error instanceof RuntimeRoleError) throw new OperatorFailure(error.message, 4);
      if (error instanceof MigrationValidationError) throw new OperatorFailure(error.message, 1);
      if (error instanceof MigrationFailure) throw new OperatorFailure(error.message, 1);
      throw error;
    }
  },
};
