import 'server-only';
import { buildInfo } from '@guide/contracts';
import { describeSchemaDrift, describeSchemaState } from '@guide/database';
import { getApplication, isConfigured } from './application';
import { deploymentStatus, sampleLibraryEnabled } from './deployment';
import { describeError, logEvent } from './log';
import { mediaStatus } from './media';
import { setupState } from './setup';

/**
 * Runs once when the server starts, before any request is handled.
 *
 * The application never applies migrations itself: that stays an explicit
 * operator step, so a rollout cannot race. But it must not quietly serve a
 * database it does not match, so each problem is named here as its own log
 * line, followed by one `startup` summary. /api/health answers 503 for as
 * long as a problem lasts, so a healthcheck keeps traffic away.
 */
export async function reportStartup() {
  const status = deploymentStatus();
  const { production } = status;
  if (production)
    for (const problem of status.problems)
      logEvent('error', 'config.invalid', { variable: problem.variable, message: problem.message });
  if (status.previewIgnored)
    logEvent('warn', 'config.ignored', {
      message: 'Preview identities are disabled in production.',
    });
  const summary = {
    ...buildInfo(),
    mode: sampleLibraryEnabled() ? 'sample' : production ? 'production' : 'development',
  };
  if (!isConfigured()) {
    logEvent('info', 'startup', { ...summary, database: 'not-configured' });
    return;
  }
  const application = getApplication();
  let schema: 'current' | 'behind' | 'ahead' | 'unreadable' = 'unreadable';
  try {
    const state = await application.store.schemaState();
    const behind = describeSchemaState(state, production ? 'deployment' : 'local');
    const ahead = describeSchemaDrift(state);
    if (behind) logEvent('error', 'schema.behind', { message: behind });
    else if (ahead) logEvent('warn', 'schema.ahead', { message: ahead });
    schema = behind ? 'behind' : ahead ? 'ahead' : 'current';
  } catch (error) {
    // An unreachable database is a different problem from drift; don't guess.
    logEvent('error', 'database.unreachable', { error: describeError(error) });
  }
  const media = await mediaStatus({ production });
  if (media !== 'ok')
    logEvent('error', 'media.unavailable', {
      message: 'The picture directory is missing or cannot be read and written.',
    });
  let setup: Awaited<ReturnType<typeof setupState>> | 'unknown' = 'unknown';
  if (schema === 'current' || schema === 'ahead')
    try {
      setup = await setupState();
    } catch {
      // Already reported by the schema or database line above.
    }
  // The default login is published; say so on every start until it is gone.
  if (setup === 'default-login')
    logEvent('warn', 'setup.default-login', {
      message: `The default login admin@example.com (password changeme) still works. Open ${application.origin}, sign in with it and finish setting up.`,
    });
  if (setup === 'no-account')
    logEvent('error', 'setup.no-account', {
      message:
        'Nobody can sign in: the database has no accounts. Run passdown migrate, which creates the default login in an empty database, or restore a complete backup.',
    });
  logEvent('info', 'startup', { ...summary, origin: application.origin, schema, media, setup });
}
