import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Reader } from '../../../components/reader';
import { isConfigured } from '../../../lib/application';
import { getPublicScope } from '../../../lib/queries';
export const dynamic = 'force-dynamic';
type GuidePageProps = { params: Promise<{ guide: string }> };

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { guide: id } = await params;
  const guide = await (await getPublicScope())?.get(id);
  if (!guide) {
    return { title: 'Guide unavailable', description: 'This guide is not available.' };
  }
  return { title: guide.title, description: guide.summary };
}

export default async function Page({ params }: GuidePageProps) {
  const { guide: id } = await params;
  const guide = await (await getPublicScope())?.get(id);
  if (!guide) notFound();
  return <Reader guide={guide} persistent={isConfigured()} />;
}
