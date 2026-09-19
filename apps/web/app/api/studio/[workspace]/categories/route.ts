import { createCategorySchema, categoryDomainSchema } from '@guide/contracts';
import { getApplication, mutationContext, requireSession } from '../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string }> };
export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    const { actor } = await requireSession(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);
    const url = new URL(request.url);
    return Response.json({
      categories: await getApplication().store.listCategories(actor, workspace, {
        domain: url.searchParams.has('domain')
          ? parseInput(categoryDomainSchema, url.searchParams.get('domain'))
          : undefined,
        includeArchived: url.searchParams.get('includeArchived') === 'true',
      }),
    });
  });
}
export function POST(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);
    const input = parseInput(createCategorySchema, await readJSON(request));
    return Response.json(
      { category: await store.createCategory(actor, workspace, input) },
      { status: 201 },
    );
  });
}
