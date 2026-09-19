import pg from 'pg';
import { readConfig } from './local-config.mjs';
import { readSchemaState, describeSchemaState } from '../packages/database/src/schema-state.ts';

/**
 * Reports whether the configured database matches the migrations on disk,
 * without changing anything. Useful before an upgrade and in a container
 * healthcheck, where applying migrations is a separate, deliberate step.
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
