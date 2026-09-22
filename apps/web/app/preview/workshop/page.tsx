import { notFound, redirect } from 'next/navigation';
import { resolveCategoryFilter } from '../../../lib/category-filter';
import { Library } from '../../../components/library';
import { getTeamPreviewScope, readLibraryPage } from '../../../lib/queries';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scope = getTeamPreviewScope();
  if (!scope) notFound();
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.slice(0, 200) : '';
  const category = typeof params.category === 'string' ? params.category.slice(0, 100) : '';
  const [taxonomy, categoryCounts] = await Promise.all([
    scope.categories(),
    scope.categoryCounts(),
  ]);
  const selected = resolveCategoryFilter(taxonomy, category);
  if (selected)
    redirect(
      `/preview/workshop/categories/${selected.id}${query ? `?q=${encodeURIComponent(query)}` : ''}`,
    );
  const page = await readLibraryPage(scope, { search: query }, params.page);
  return (
    <Library
      team
      guides={page.guides}
      total={page.total}
      offset={page.offset}
      limit={page.limit}
      taxonomy={taxonomy}
      categoryCounts={categoryCounts}
      query={query}
    />
  );
}
