import { ApplicationError } from '@guide/contracts';
import { getPublicScope } from '../../../../../../lib/queries';
import { apiResponse, assertIdentifier } from '../../../../../../lib/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request, { params }: { params: Promise<{ workspace: string }> }) {
  return apiResponse(async () => {
    const { workspace } = await params;
    assertIdentifier(workspace);
    const scope = await getPublicScope(workspace);
    if (!scope) throw new ApplicationError('NOT_FOUND', 'Workspace not found.', 404);
    const search = new URL(request.url).searchParams.get('q') ?? '';
    if (search.length > 200)
      throw new ApplicationError('INVALID_QUERY', 'Search is limited to 200 characters.', 422);
    const categoryId = new URL(request.url).searchParams.get('categoryId') || undefined;
    if (categoryId) assertIdentifier(categoryId);
    const guides = (await scope.list({ search, categoryId })).map((guide) => {
      const { id, title, summary, category } = guide;
      return {
        id,
        title,
        summary,
        category,
        ...('categoryId' in guide
          ? { categoryId: guide.categoryId, categoryPath: guide.categoryPath }
          : {}),
      };
    });
    return Response.json({ guides, total: guides.length });
  });
}
