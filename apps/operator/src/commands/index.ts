import { backupCommand } from './backup';
import { restoreCommand } from './restore';
import { verifyMediaCommand } from './verify-media';
import { migrateCommand } from './migrate';
import { setupStateCommand } from './setup-state';
import { statusCommand } from './status';
import { versionCommand } from './version';
import { runtimePasswordCommand } from './runtime-password';
import { adminCommand, resetPasswordCommand } from './accounts';
import { initSecretsCommand } from './init-secrets';
export const commands = [
  backupCommand,
  restoreCommand,
  verifyMediaCommand,
  migrateCommand,
  setupStateCommand,
  statusCommand,
  versionCommand,
  runtimePasswordCommand,
  resetPasswordCommand,
  adminCommand,
  initSecretsCommand,
];
