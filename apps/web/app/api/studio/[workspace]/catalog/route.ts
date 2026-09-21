import { createCatalogItemSchema } from '@guide/contracts';
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
    const store = getApplication().store;
    const items = await store.listCatalogItems(actor, workspace, {
      includeArchived: url.searchParams.get('includeArchived') === 'true',
      search: url.searchParams.get('search') ?? undefined,
    });
    if (url.searchParams.get('usage') !== 'true') return Response.json({ items });
    // Same authorized scope as the listing, so a total cannot imply a guide the
    // caller may not open.
    return Response.json({ items, usage: await store.listCatalogUsage(actor, workspace) });
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
