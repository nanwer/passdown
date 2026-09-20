import { Library } from '../components/library';
import { isConfigured } from '../lib/application';
import { emptyLibraryPage, getPublicScope, getSections, readLibraryPage } from '../lib/queries';
import { resolveCategoryFilter } from '../lib/category-filter';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === 'string' ? params.q.slice(0, 200) : '';
  const category = typeof params.category === 'string' ? params.category.slice(0, 100) : '';
  const scope = (await getPublicScope())!;
  const sections = await getSections('repair-collective', 'public');
  const [taxonomy, categoryCounts, categoryNames] = await Promise.all([
    scope.categories(),
    scope.categoryCounts(),
    scope.categoryNames(),
  ]);
  const selected = resolveCategoryFilter(taxonomy, category);
  const filter = selected ? { categoryId: selected.id } : { category };
  // A bookmarked category name that no longer resolves selects nothing rather
  // than quietly showing the whole library.
  const page =
    isConfigured() && category && !selected
      ? emptyLibraryPage
      : await readLibraryPage(scope, { search: query, ...filter }, params.page);
  return (
    <Library
      guides={page.guides}
      total={page.total}
      offset={page.offset}
      limit={page.limit}
      persistent={isConfigured()}
      categories={categoryNames}
      taxonomy={isConfigured() ? taxonomy : undefined}
      categoryCounts={categoryCounts}
      query={query}
      category={selected?.id ?? category}
      sections={sections}
    />
  );
}
