import pg from 'pg';
import { readConfig } from './local-config.mjs';
import { readSchemaState, describeSchemaState } from '../packages/database/src/schema-state.ts';

/**
 * Reports whether the configured database matches the migrations this build
 * ships with, without changing anything — for an operator about to upgrade,
 * where applying migrations is a separate, deliberate step. A running
 * deployment answers the same question at /api/health.
 *
 * It reads TypeScript, so it runs under tsx rather than plain node; pnpm
 * local:verify does that for you.
 */
const client = new pg.Client({ connectionString: readConfig().GUIDE_OWNER_DATABASE_URL });
await client.connect();
try {
  const state = await readSchemaState(client);
  const message = describeSchemaState(state);
  if (message) {
    console.error(message);
    process.exitCode = 1;
  } else {
    console.log(`Database schema is current (${state.applied} migrations applied).`);
  }
} finally {
  await client.end();
}
