import { getApplication, requireSession } from '../../../../lib/application';
import { apiResponse } from '../../../../lib/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return apiResponse(async () => {
    const { session, actor } = await requireSession(request);
    return Response.json({
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
      workspaces: await getApplication().store.listWorkspaces(actor),
    });
  });
}
