import { ApplicationError, updateCategorySchema } from '@guide/contracts';
import { getApplication, mutationContext, requireSession } from '../../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; category: string }> };
export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    const { actor } = await requireSession(request);
    const { workspace, category } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(category);
    const store = getApplication().store;
    const result = await store.getCategory(actor, workspace, category);
    if (!result) throw new ApplicationError('NOT_FOUND', 'Record not found.', 404);
    const params = new URL(request.url).searchParams;
    return Response.json({
      category: result,
      ...(params.get('blockers') === 'true'
        ? { blockers: await store.categoryBlockers(actor, workspace, category) }
        : {}),
      ...(params.get('counts') === 'true'
        ? { counts: await store.listCategoryCount(actor, workspace, category) }
        : {}),
    });
  });
}
export function PATCH(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace, category } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(category);
    const input = parseInput(updateCategorySchema, await readJSON(request));
    return Response.json({
      category: await store.updateCategory(actor, workspace, category, input),
    });
  });
}
