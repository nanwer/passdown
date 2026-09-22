import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTeamPreviewScope, readLibraryPage } from '../../../../../lib/queries';
import { Library } from '../../../../../components/library';
export const dynamic = 'force-dynamic';
type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: id } = await params;
  const category = (await getTeamPreviewScope()?.categories())?.find((item) => item.id === id);
  return category ? { title: category.name } : { title: 'Category unavailable' };
}
/**
 * The sample library's categories have pages too.
 *
 * Without this, a category had two addresses on a real installation and one on
 * the sample — which is why the chips filtered through `?category=` everywhere
 * rather than linking to the page that actually describes a category.
 */
export default async function Page({ params, searchParams }: Props) {
  const { category: id } = await params;
  const scope = getTeamPreviewScope();
  if (!scope) notFound();
  const taxonomy = await scope.categories();
  const category = taxonomy.find((item) => item.id === id);
  if (!category) notFound();
  const search = await searchParams;
  const query = typeof search.q === 'string' ? search.q.slice(0, 200) : '';
  const [categoryCounts, page] = await Promise.all([
    scope.categoryCounts(),
    readLibraryPage(scope, { categoryId: id, search: query }, search.page),
  ]);
  return (
    <Library
      team
      guides={page.guides}
      total={page.total}
      offset={page.offset}
      limit={page.limit}
      taxonomy={taxonomy}
      selectedCategory={category}
      categoryCounts={categoryCounts}
      query={query}
    />
  );
}
