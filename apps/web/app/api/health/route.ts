import { setupRequired } from '../../../lib/setup';
import { deploymentStatus, sampleLibraryEnabled } from '../../../lib/deployment';
import { describeSchemaDrift, describeSchemaState } from '@guide/database';
import { getApplication, isConfigured } from '../../../lib/application';
import { apiResponse } from '../../../lib/http';
export const dynamic = 'force-dynamic';
export function GET() {
  return apiResponse(async () => {
    if (sampleLibraryEnabled()) return Response.json({ status: 'ready', mode: 'sample' });
    if (!isConfigured()) return Response.json({ status: 'not-configured' }, { status: 503 });
    const store = getApplication().store;
    const healthy = await store.health();
    if (!healthy)
      return Response.json({ status: 'unavailable', mode: 'persistent' }, { status: 503 });
    // A reachable database that does not match this build is not ready. Saying
    // so here means an operator or a container healthcheck learns it without
    // waiting for a request that happens to need the missing object.
    const state = await store.schemaState();
    const schema = describeSchemaState(
      state,
      deploymentStatus().production ? 'deployment' : 'local',
    );
    // Being ahead of this build is reported but still served: during a rolling
    // deploy the new version migrates while old instances are still answering.
    const drift = describeSchemaDrift(state);
    return Response.json(
      {
        status: schema ? 'schema-behind' : (await setupRequired()) ? 'setup-required' : 'ready',
        mode: 'persistent',
        ...(schema && { schema }),
        ...(drift && { warning: drift }),
      },
      { status: schema ? 503 : 200 },
    );
  });
}
