import { notFound } from 'next/navigation';
import {
  emptyLibraryPage,
  getInternalScope,
  getLibraries,
  readLibraryPage,
  viewerSignedIn,
} from '../../../lib/queries';
import { Library } from '../../../components/library';
import { resolveCategoryFilter } from '../../../lib/category-filter';
export const dynamic = 'force-dynamic';
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace } = await params;
  // The members-only section of this workspace. Anyone without an active
  // membership gets a 404 rather than a sign-in prompt, so the section's
  // existence is not advertised.
  const scope = await getInternalScope(workspace);
  if (!scope) notFound();
  const [libraries, signedIn] = await Promise.all([
    getLibraries(`/w/${workspace}`),
    viewerSignedIn(),
  ]);
  const paramsValue = await searchParams;
  const query = typeof paramsValue.q === 'string' ? paramsValue.q.slice(0, 200) : '';
  const category =
    typeof paramsValue.category === 'string' ? paramsValue.category.slice(0, 100) : '';
  const [taxonomy, categoryCounts] = await Promise.all([
    scope.categories(),
    scope.categoryCounts(),
  ]);
  const selected = resolveCategoryFilter(taxonomy, category);
  const filter = selected ? { categoryId: selected.id } : { category };
  const page =
    category && !selected
      ? emptyLibraryPage
      : await readLibraryPage(scope, { search: query, ...filter }, paramsValue.page);
  return (
    <Library
      guides={page.guides}
      total={page.total}
      offset={page.offset}
      limit={page.limit}
      taxonomy={taxonomy}
      categoryCounts={categoryCounts}
      query={query}
      category={selected?.id ?? category}
      team
      persistent
      basePath={`/w/${workspace}`}
      workspaceName={scope.workspace.name}
      libraries={libraries}
      signedIn={signedIn}
    />
  );
}
