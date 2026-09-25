import { ApplicationError, updateCatalogItemSchema } from '@guide/contracts';
import { getApplication, mutationContext, requireSession } from '../../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; item: string }> };
export function GET(request: Request, context: Context) {
  return apiResponse(
    { route: '/api/studio/[workspace]/catalog/[item]', method: 'GET' },
    async () => {
      const { actor } = await requireSession(request);
      const { workspace, item } = await context.params;
      assertIdentifier(workspace);
      assertIdentifier(item);
      const result = await getApplication().store.getCatalogItem(actor, workspace, item);
      if (!result) throw new ApplicationError('NOT_FOUND', 'Record not found.', 404);
      return Response.json({ item: result });
    },
  );
}
export function PATCH(request: Request, context: Context) {
  return apiResponse(
    { route: '/api/studio/[workspace]/catalog/[item]', method: 'PATCH' },
    async () => {
      const { store, actor } = await mutationContext(request);
      const { workspace, item } = await context.params;
      assertIdentifier(workspace);
      assertIdentifier(item);
      const input = parseInput(updateCatalogItemSchema, await readJSON(request));
      return Response.json({ item: await store.updateCatalogItem(actor, workspace, item, input) });
    },
  );
}
