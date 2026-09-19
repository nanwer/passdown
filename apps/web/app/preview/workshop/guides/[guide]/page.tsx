import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Reader } from '../../../../../components/reader';
import { getTeamPreviewScope } from '../../../../../lib/queries';
export const dynamic = 'force-dynamic';
type GuidePageProps = { params: Promise<{ guide: string }> };

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const guide = getTeamPreviewScope()?.get((await params).guide);
  if (!guide) {
    return { title: 'Guide unavailable', description: 'This guide is not available.' };
  }
  return { title: `${guide.title} — synthetic team preview`, description: guide.summary };
}

export default async function Page({ params }: GuidePageProps) {
  const guide = getTeamPreviewScope()?.get((await params).guide);
  if (!guide) notFound();
  return <Reader guide={guide} team />;
}
