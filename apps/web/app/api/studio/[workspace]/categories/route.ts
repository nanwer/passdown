import {
  categoryManagementQuerySchema,
  createCategorySchema,
  categoryDomainSchema,
} from '@guide/contracts';
import { getApplication, mutationContext, requireSession } from '../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string }> };
export function GET(request: Request, context: Context) {
  return apiResponse({ route: '/api/studio/[workspace]/categories', method: 'GET' }, async () => {
    const { actor } = await requireSession(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);
    const url = new URL(request.url);
    const store = getApplication().store;
    if (url.searchParams.has('page')) {
      const query = parseInput(categoryManagementQuerySchema, Object.fromEntries(url.searchParams));
      return Response.json(await store.listCategoryPage(actor, workspace, query));
    }
    const categories = await store.listCategories(actor, workspace, {
      domain: url.searchParams.has('domain')
        ? parseInput(categoryDomainSchema, url.searchParams.get('domain'))
        : undefined,
      includeArchived: url.searchParams.get('includeArchived') === 'true',
    });
    if (url.searchParams.get('counts') !== 'true') return Response.json({ categories });
    // Counts run through the same authorized scope as the listing, so a caller
    // can never infer categories or guides it may not read from a total.
    const domains = [...new Set(categories.map((category) => category.domain))];
    const counts = (
      await Promise.all(domains.map((domain) => store.listCategoryCounts(actor, workspace, domain)))
    ).flat();
    return Response.json({ categories, counts });
  });
}
export function POST(request: Request, context: Context) {
  return apiResponse({ route: '/api/studio/[workspace]/categories', method: 'POST' }, async () => {
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
