import { createCatalogItemSchema, catalogKindSchema } from '@guide/contracts';
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
      items: await getApplication().store.listCatalogItems(actor, workspace, {
        kind: url.searchParams.has('kind')
          ? parseInput(catalogKindSchema, url.searchParams.get('kind'))
          : undefined,
        includeArchived: url.searchParams.get('includeArchived') === 'true',
        categoryId: url.searchParams.get('categoryId') ?? undefined,
        search: url.searchParams.get('search') ?? undefined,
      }),
    });
  });
}
export function POST(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);
    const input = parseInput(createCatalogItemSchema, await readJSON(request));
    return Response.json(
      { item: await store.createCatalogItem(actor, workspace, input) },
      { status: 201 },
    );
  });
}
