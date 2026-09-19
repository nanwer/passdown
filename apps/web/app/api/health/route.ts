import { describeSchemaState } from '@guide/database';
import { getApplication, isConfigured } from '../../../lib/application';
import { apiResponse } from '../../../lib/http';
export const dynamic = 'force-dynamic';
export function GET() {
  return apiResponse(async () => {
    if (!isConfigured()) return Response.json({ status: 'ready', mode: 'sample' });
    const store = getApplication().store;
    const healthy = await store.health();
    if (!healthy)
      return Response.json({ status: 'unavailable', mode: 'persistent' }, { status: 503 });
    // A reachable database that does not match this build is not ready. Saying
    // so here means an operator or a container healthcheck learns it without
    // waiting for a request that happens to need the missing object.
    const schema = describeSchemaState(await store.schemaState());
    return Response.json(
      { status: schema ? 'schema-behind' : 'ready', mode: 'persistent', ...(schema && { schema }) },
      { status: schema ? 503 : 200 },
    );
  });
}
