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
    const result = await getApplication().store.getCategory(actor, workspace, category);
    if (!result) throw new ApplicationError('NOT_FOUND', 'Record not found.', 404);
    return Response.json({ category: result });
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
