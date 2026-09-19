import { getApplication, isConfigured } from '../../../lib/application';
import { apiResponse } from '../../../lib/http';
export const dynamic = 'force-dynamic';
export function GET() {
  return apiResponse(async () => {
    if (!isConfigured()) return Response.json({ status: 'ready', mode: 'sample' });
    const healthy = await getApplication().store.health();
    return Response.json(
      { status: healthy ? 'ready' : 'unavailable', mode: 'persistent' },
      { status: healthy ? 200 : 503 },
    );
  });
}
