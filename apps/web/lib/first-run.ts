import 'server-only';
import { bootstrapFirstRun } from '@guide/database';
import { isConfigured } from './application';

/**
 * Create the first administrator, if this installation has never had one.
 *
 * Reads its settings from the environment so a deployment is one compose file
 * and nothing to run afterwards. Every one of them is optional: an operator who
 * sets nothing still gets a working administrator and a password on their
 * console, which is the point.
 *
 *   PASSDOWN_ADMIN_EMAIL          who to create, default admin@passdown.local
 *   PASSDOWN_ADMIN_PASSWORD       set one yourself instead of being given one
 *   PASSDOWN_ADMIN_PASSWORD_FILE  where to also write a generated password
 *   PASSDOWN_WORKSPACE_NAME       what the first workspace is called
 *
 * Supplying PASSDOWN_ADMIN_PASSWORD is honoured but is the weaker option: an
 * environment variable is readable from docker inspect, from ps, and from any
 * crash dump that captures the environment, whereas a generated one exists in
 * the log and in a file the operator controls. Either way the account cannot be
 * used for anything until the password has been changed.
 */
export async function bootstrapIfEmpty(): Promise<void> {
  if (!isConfigured()) return;
  const connectionString = process.env.GUIDE_DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!connectionString || !secret || !baseURL) return;
  try {
    await bootstrapFirstRun({
      connectionString,
      secret,
      baseURL,
      email: process.env.PASSDOWN_ADMIN_EMAIL,
      password: process.env.PASSDOWN_ADMIN_PASSWORD,
      passwordFile: process.env.PASSDOWN_ADMIN_PASSWORD_FILE,
      workspaceName: process.env.PASSDOWN_WORKSPACE_NAME,
    });
  } catch (error) {
    // A database that is unreachable or behind its migrations is already
    // reported by the schema check beside this one, and the health endpoint
    // keeps traffic away. Failing to start on top of that would turn a
    // recoverable state into a crash loop.
    console.error(
      `\nPassdown could not create a first administrator.\n  ${(error as Error).message}\n`,
    );
  }
}
