import type { PublishedGuide } from '@guide/contracts';
import { Library } from '../components/library';
import { isConfigured } from '../lib/application';
import { getPublicScope } from '../lib/queries';
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
  const [allGuides, taxonomy] = await Promise.all([scope.list(), scope.categories()]);
  const categories = [...new Set(allGuides.map((guide) => guide.category))];
  const selected = resolveCategoryFilter(taxonomy, category);
  const filter = selected ? { categoryId: selected.id } : { category };
  return (
    <Library
      guides={
        isConfigured() && category && !selected
          ? []
          : await scope.list({ search: query, ...filter })
      }
      persistent={isConfigured()}
      categories={categories}
      taxonomy={isConfigured() ? taxonomy : undefined}
      categoryGuides={allGuides.map((guide) => ({
        categoryPath: 'categoryPath' in guide ? (guide as PublishedGuide).categoryPath : [],
      }))}
      query={query}
      category={selected?.id ?? category}
    />
  );
}
