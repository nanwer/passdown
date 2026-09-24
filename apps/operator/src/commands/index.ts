import { backupCommand } from './backup';
import { restoreCommand } from './restore';
import { verifyMediaCommand } from './verify-media';
import { migrateCommand } from './migrate';
import { setupStateCommand } from './setup-state';
export const commands = [
  backupCommand,
  restoreCommand,
  verifyMediaCommand,
  migrateCommand,
  setupStateCommand,
];
