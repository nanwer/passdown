import type { PublishedGuide } from '@guide/contracts';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicScope } from '../../../lib/queries';
import { Library } from '../../../components/library';
export const dynamic = 'force-dynamic';
type Props = {
  params: Promise<{ category: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: id } = await params;
  const category = (await (await getPublicScope())?.categories())?.find((item) => item.id === id);
  return category
    ? { title: category.name, description: category.description || `Guides in ${category.name}.` }
    : { title: 'Category unavailable' };
}
export default async function Page({ params, searchParams }: Props) {
  const { category: id } = await params;
  const scope = await getPublicScope();
  if (!scope) notFound();
  const taxonomy = await scope.categories();
  const category = taxonomy.find((item) => item.id === id);
  if (!category) notFound();
  const search = await searchParams;
  const query = typeof search.q === 'string' ? search.q.slice(0, 200) : '';
  const [allGuides, guides] = await Promise.all([
    scope.list(),
    scope.list({ categoryId: id, search: query }),
  ]);
  return (
    <Library
      guides={guides}
      categories={[]}
      taxonomy={taxonomy}
      selectedCategory={category}
      categoryGuides={allGuides.map((guide) => ({
        categoryPath: 'categoryPath' in guide ? (guide as PublishedGuide).categoryPath : [],
      }))}
      query={query}
      persistent
    />
  );
}
