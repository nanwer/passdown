import 'server-only';
import { buildInfo } from '@guide/contracts';
import { describeSchemaDrift, describeSchemaState } from '@guide/database';
import { getApplication, isConfigured } from './application';
import { deploymentStatus, sampleLibraryEnabled } from './deployment';
import { describeError, logEvent } from './log';
import { mediaStatus } from './media';
import { setupRequired } from './setup';

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
  if (process.env.PASSDOWN_SETUP_CODE_SHA256 && !status.setupCodeHash)
    logEvent('error', 'config.invalid', {
      variable: 'PASSDOWN_SETUP_CODE_SHA256',
      message: 'The setup code hash is invalid, so browser setup is unavailable.',
    });
  const summary = {
    ...buildInfo(),
    mode: sampleLibraryEnabled() ? 'sample' : production ? 'production' : 'development',
    setupCode: status.setupCodeHash ? 'configured' : 'missing',
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
  let setup: 'required' | 'complete' | 'unknown' = 'unknown';
  if (schema === 'current' || schema === 'ahead')
    try {
      setup = (await setupRequired()) ? 'required' : 'complete';
    } catch {
      // Already reported by the schema or database line above.
    }
  logEvent('info', 'startup', { ...summary, origin: application.origin, schema, media, setup });
}
