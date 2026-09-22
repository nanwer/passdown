import { Library } from '../components/library';
import { isConfigured } from '../lib/application';
import {
  emptyLibraryPage,
  getPublicScope,
  getLibraries,
  readLibraryPage,
  rootWorkspaceId,
  viewerSignedIn,
} from '../lib/queries';
import { redirect } from 'next/navigation';
import { resolveCategoryFilter } from '../lib/category-filter';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Asked, not assumed. This used to be the name of a development seed, which
  // is why every other installation's front page answered 500.
  const rootWorkspace = await rootWorkspaceId();
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
  const scope = rootWorkspace ? await getPublicScope(rootWorkspace) : null;
  const [libraries, signedIn] = await Promise.all([getLibraries('/'), viewerSignedIn()]);
  const [taxonomy, categoryCounts] = scope
    ? await Promise.all([scope.categories(), scope.categoryCounts()])
    : [[], []];
  // A category has one address, its own page. This kept working for anything
  // bookmarked or linked while both existed.
  const selected = resolveCategoryFilter(taxonomy, category);
  if (selected)
    redirect(`/categories/${selected.id}${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  // A bookmarked category that no longer resolves shows nothing rather than
  // quietly showing the whole library.
  const page =
    !scope || (isConfigured() && category)
      ? emptyLibraryPage
      : await readLibraryPage(scope, { search: query }, params.page);
  return (
    <Library
      guides={page.guides}
      total={page.total}
      offset={page.offset}
      limit={page.limit}
      persistent={isConfigured()}
      taxonomy={taxonomy}
      categoryCounts={categoryCounts}
      query={query}
      category={category}
      libraries={libraries}
      signedIn={signedIn}
    />
  );
}
