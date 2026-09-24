import { deploymentStatus } from './deployment';
import 'server-only';
import { describeSchemaDrift, describeSchemaState } from '@guide/database';
import { getApplication, isConfigured } from './application';

/**
 * Names a schema mismatch once at startup, so an operator reads it in the log
 * rather than meeting it later as an unrelated request failure. Kept out of
 * instrumentation.ts itself so the Node-only work is never analysed for the
 * Edge runtime.
 */
export async function reportSchemaState(): Promise<void> {
  if (!isConfigured()) return;
  let message: string | null;
  let drift: string | null;
  try {
    const state = await getApplication().store.schemaState();
    message = describeSchemaState(state, deploymentStatus().production ? 'deployment' : 'local');
    drift = describeSchemaDrift(state);
  } catch (error) {
    // An unreachable database is a different problem, already reported by the
    // health endpoint and by individual requests. Do not mistake it for drift.
    console.error(
      'Passdown could not read the database schema state at startup:',
      error instanceof Error ? error.message : error,
    );
    return;
  }
  if (message) console.error(`\nPassdown cannot serve this database.\n  ${message}\n`);
  else if (drift) console.warn(`\nPassdown is behind this database.\n  ${drift}\n`);
}
