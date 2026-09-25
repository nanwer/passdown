import { setupRequired } from '../../../lib/setup';
import { deploymentStatus, sampleLibraryEnabled } from '../../../lib/deployment';
import { describeSchemaDrift, describeSchemaState } from '@guide/database';
import { getApplication, isConfigured } from '../../../lib/application';
import { healthReport } from '../../../lib/health';
import { apiResponse } from '../../../lib/http';
import { mediaStatus } from '../../../lib/media';
export const dynamic = 'force-dynamic';
export function GET() {
  return apiResponse({ route: '/api/health', method: 'GET' }, async () => {
    // A reachable database that does not match this build is not ready. Saying
    // so here means an operator or a container healthcheck learns it without
    // waiting for a request that happens to need the missing object. The
    // details of a mismatch are in the startup log, not this public answer.
    const { status, body } = await healthReport({
      sample: sampleLibraryEnabled,
      configured: isConfigured,
      database: () => getApplication().store.health(),
      schema: async () => {
        const state = await getApplication().store.schemaState();
        if (describeSchemaState(state, deploymentStatus().production ? 'deployment' : 'local'))
          return 'behind';
        return describeSchemaDrift(state) ? 'ahead' : 'current';
      },
      media: () => mediaStatus({ production: deploymentStatus().production }),
      setupRequired,
    });
    return Response.json(body, { status });
  });
}
