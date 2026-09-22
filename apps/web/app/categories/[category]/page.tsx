import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  getLibraries,
  getPublicScope,
  readLibraryPage,
  viewerSignedIn,
} from '../../../lib/queries';
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
  const [categoryCounts, page, libraries, signedIn] = await Promise.all([
    scope.categoryCounts(),
    readLibraryPage(scope, { categoryId: id, search: query }, search.page),
    // The library this category belongs to, not the page you are on, so the
    // tab for it stays marked while you browse inside it.
    getLibraries('/'),
    viewerSignedIn(),
  ]);
  return (
    <Library
      guides={page.guides}
      total={page.total}
      offset={page.offset}
      limit={page.limit}
      categories={[]}
      taxonomy={taxonomy}
      selectedCategory={category}
      categoryCounts={categoryCounts}
      query={query}
      persistent
      libraries={libraries}
      signedIn={signedIn}
    />
  );
}
