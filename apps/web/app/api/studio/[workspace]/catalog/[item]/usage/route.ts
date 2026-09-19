import { getApplication, requireSession } from '../../../../../../../lib/application';
import { apiResponse, assertIdentifier } from '../../../../../../../lib/http';
export const dynamic = 'force-dynamic';
export function GET(
  request: Request,
  context: { params: Promise<{ workspace: string; item: string }> },
) {
  return apiResponse(async () => {
    const { actor } = await requireSession(request);
    const { workspace, item } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(item);
    return Response.json(await getApplication().store.getCatalogUsage(actor, workspace, item));
  });
}
