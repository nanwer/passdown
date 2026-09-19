import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getMemberScope } from '../../../../../lib/queries';
import { Reader } from '../../../../../components/reader';
export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ workspace: string; guide: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace, guide: id } = await params;
  const guide = await (await getMemberScope(workspace))?.get(id);
  return guide
    ? { title: guide.title, description: guide.summary }
    : { title: 'Guide unavailable', description: 'This guide is not available.' };
}
export default async function Page({ params }: Props) {
  const { workspace, guide: id } = await params;
  const scope = await getMemberScope(workspace);
  const guide = await scope?.get(id);
  if (!scope || !guide) notFound();
  const family = await scope.family(id);
  return (
    <Reader
      guide={guide}
      family={family}
      team={scope.workspace.audience === 'private'}
      persistent
      basePath={`/w/${workspace}`}
      workspaceName={scope.workspace.name}
    />
  );
}
