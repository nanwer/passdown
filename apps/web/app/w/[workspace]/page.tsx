import { notFound } from 'next/navigation';
import { getInternalScope, getSections } from '../../../lib/queries';
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
  const sections = await getSections(workspace, 'internal');
  const paramsValue = await searchParams;
  const query = typeof paramsValue.q === 'string' ? paramsValue.q.slice(0, 200) : '';
  const category =
    typeof paramsValue.category === 'string' ? paramsValue.category.slice(0, 100) : '';
  const [allGuides, taxonomy] = await Promise.all([scope.list(), scope.categories()]);
  const categories = [...new Set(allGuides.map((guide) => guide.category))];
  const selected = resolveCategoryFilter(taxonomy, category);
  const filter = selected ? { categoryId: selected.id } : { category };
  return (
    <Library
      guides={category && !selected ? [] : await scope.list({ search: query, ...filter })}
      categories={categories}
      taxonomy={taxonomy}
      categoryGuides={allGuides}
      query={query}
      category={selected?.id ?? category}
      team
      persistent
      basePath={`/w/${workspace}`}
      workspaceName={scope.workspace.name}
      sections={sections}
    />
  );
}
