import { guideFamilySchema } from '@guide/contracts';
import { getApplication, mutationContext, requireSession } from '../../../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; guide: string }> };

export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    const { actor } = await requireSession(request);
    const { workspace, guide } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(guide);
    return Response.json({
      family: await getApplication().store.getGuideFamily(actor, workspace, guide),
    });
  });
}

export function PUT(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace, guide } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(guide);
    const input = parseInput(guideFamilySchema, await readJSON(request));
    await store.setGuideParent(actor, workspace, guide, input.parentGuideId, input.sortOrder);
    return Response.json({ family: await store.getGuideFamily(actor, workspace, guide) });
  });
}
