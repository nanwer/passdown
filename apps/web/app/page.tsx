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
  const rootWorkspace = 'repair-collective';
  const query = typeof params.q === 'string' ? params.q.slice(0, 200) : '';
  const category = typeof params.category === 'string' ? params.category.slice(0, 100) : '';
  // The workspace whose public library this installation shows at its root.
  //
  // Which workspace that is has never been modelled, so it was a literal — and
  // the non-null assertion that used to be here turned "no such workspace" into
  // a crash. On any installation not carrying this development seed, including
  // every one the first-run bootstrap creates, the front page answered 500.
  //
  // Answering that question properly is the information architecture work in
  // docs/backlog.md. Until then the page renders empty rather than falling over.
  const scope = await getPublicScope();
  const sections = scope ? await getSections(rootWorkspace, 'public') : undefined;
  const [taxonomy, categoryCounts, categoryNames] = scope
    ? await Promise.all([scope.categories(), scope.categoryCounts(), scope.categoryNames()])
    : [[], [], []];
  const selected = resolveCategoryFilter(taxonomy, category);
  const filter = selected ? { categoryId: selected.id } : { category };
  // A bookmarked category name that no longer resolves selects nothing rather
  // than quietly showing the whole library.
  const page =
    !scope || (isConfigured() && category && !selected)
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
