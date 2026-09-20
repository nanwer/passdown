import { notFound } from 'next/navigation';
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
  const [page, categories] = await Promise.all([
    readLibraryPage(scope, { search: query, category }, params.page),
    scope.categoryNames(),
  ]);
  return (
    <Library
      team
      guides={page.guides}
      total={page.total}
      offset={page.offset}
      limit={page.limit}
      categories={categories}
      query={query}
      category={category}
    />
  );
}
