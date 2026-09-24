import { WithdrawnGuide } from '../../../components/withdrawn-guide';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { Reader } from '../../../components/reader';
import { isConfigured } from '../../../lib/application';
import {
  getPublicScope,
  rootWorkspaceId,
  viewerManages,
  viewerSignedIn,
} from '../../../lib/queries';
export const dynamic = 'force-dynamic';
type GuidePageProps = { params: Promise<{ guide: string }> };

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const { guide: id } = await params;
  const scope = await getPublicScope();
  const guide = await scope?.get(id);
  if (!guide) {
    if (scope && 'withdrawn' in scope && (await scope.withdrawn(id)))
      return { title: 'Guide withdrawn', robots: { index: false, follow: false } };
    return { title: 'Guide unavailable', description: 'This guide is not available.' };
  }
  return { title: guide.title, description: guide.summary };
}

export default async function Page({ params }: GuidePageProps) {
  const { guide: id } = await params;
  const scope = await getPublicScope();
  const guide = await scope?.get(id);
  if (!guide) {
    if (scope && 'withdrawn' in scope && (await scope.withdrawn(id))) {
      const root = await rootWorkspaceId();
      return (
        <WithdrawnGuide
          libraryHref="/"
          editHref={root && (await viewerManages(root)) ? `/studio/${root}/${id}` : undefined}
        />
      );
    }
    notFound();
  }
  const family = scope && 'family' in scope ? await scope.family(id) : undefined;
  // The root library belongs to a workspace, so editing a guide read here goes
  // to that workspace's editor — and is offered only to somebody who may.
  const root = await rootWorkspaceId();
  const editHref = root && (await viewerManages(root)) ? `/studio/${root}/${id}` : undefined;
  return (
    <Reader
      guide={guide}
      persistent={isConfigured()}
      family={family}
      editHref={editHref}
      signedIn={await viewerSignedIn()}
    />
  );
}
