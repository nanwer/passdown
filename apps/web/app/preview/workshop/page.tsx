import { notFound } from 'next/navigation';
import { Library } from '../../../components/library';
import { getTeamPreviewScope } from '../../../lib/queries';
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
  return (
    <Library
      team
      guides={scope.list({ search: query, category })}
      categories={[...new Set(scope.list().map((guide) => guide.category))]}
      query={query}
      category={category}
    />
  );
}
