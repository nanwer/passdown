import {
  ApplicationError,
  libraryPageSize,
  maxLibraryPageSize,
  type PublishedGuide,
} from '@guide/contracts';
import { getPublicScope, type LibraryPage } from '../../../../../../lib/queries';
import { apiResponse, assertIdentifier } from '../../../../../../lib/http';
export const dynamic = 'force-dynamic';
/** Sample guides carry no taxonomy, so the response omits it rather than inventing one. */
const filed = (guide: LibraryPage['guides'][number]): guide is PublishedGuide =>
  'categoryPath' in guide;
/** A whole number within bounds, or the refusal that explains the bound. */
function bounded(raw: string | null, fallback: number, max: number, name: string) {
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max)
    throw new ApplicationError(
      'INVALID_QUERY',
      `${name} must be a whole number between 0 and ${max}.`,
      422,
    );
  return value;
}
export function GET(request: Request, { params }: { params: Promise<{ workspace: string }> }) {
  return apiResponse(async () => {
    const { workspace } = await params;
    assertIdentifier(workspace);
    const scope = await getPublicScope(workspace);
    if (!scope) throw new ApplicationError('NOT_FOUND', 'Workspace not found.', 404);
    const url = new URL(request.url);
    const search = url.searchParams.get('q') ?? '';
    if (search.length > 200)
      throw new ApplicationError('INVALID_QUERY', 'Search is limited to 200 characters.', 422);
    const categoryId = url.searchParams.get('categoryId') || undefined;
    if (categoryId) assertIdentifier(categoryId);
    // One response carries a page, never the whole library. `total` is what
    // matched, so a client can page through it deliberately.
    const limit = Math.max(
      bounded(url.searchParams.get('limit'), libraryPageSize, maxLibraryPageSize, 'limit'),
      1,
    );
    const offset = bounded(url.searchParams.get('offset'), 0, 100000, 'offset');
    const page: LibraryPage = await scope.list({ search, categoryId, limit, offset });
    const guides = page.guides.map((guide) => {
      const { id, title, summary, category } = guide;
      return {
        id,
        title,
        summary,
        category,
        ...(filed(guide) ? { categoryId: guide.categoryId, categoryPath: guide.categoryPath } : {}),
      };
    });
    return Response.json({ guides, total: page.total, limit: page.limit, offset: page.offset });
  });
}
