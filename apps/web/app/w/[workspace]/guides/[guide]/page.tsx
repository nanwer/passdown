import { WithdrawnGuide } from '../../../../../components/withdrawn-guide';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMemberScope, viewerManages } from '../../../../../lib/queries';
import { Reader } from '../../../../../components/reader';
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ workspace: string; guide: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace, guide: id } = await params;
  const scope = await getMemberScope(workspace);
  const guide = await scope?.get(id);
  if (!guide && scope && (await scope.withdrawn(id)))
    return { title: 'Guide withdrawn', robots: { index: false, follow: false } };
  return guide
    ? { title: guide.title, description: guide.summary }
    : { title: 'Guide unavailable', description: 'This guide is not available.' };
}
export default async function Page({ params }: Props) {
  const { workspace, guide: id } = await params;
  const scope = await getMemberScope(workspace);
  const guide = await scope?.get(id);
  if (!scope) notFound();
  if (!guide) {
    if (await scope.withdrawn(id))
      return (
        <WithdrawnGuide
          libraryHref={`/w/${workspace}`}
          workspaceLabel={scope.workspace.name}
          editHref={(await viewerManages(workspace)) ? `/studio/${workspace}/${id}` : undefined}
        />
      );
    notFound();
  }
  const family = await scope.family(id);
  return (
    <Reader
      guide={guide}
      family={family}
      team={scope.workspace.audience === 'private'}
      persistent
      // Reaching this page at all means an active membership.
      signedIn
      basePath={`/w/${workspace}`}
      workspaceName={scope.workspace.name}
      editHref={(await viewerManages(workspace)) ? `/studio/${workspace}/${id}` : undefined}
    />
  );
}
