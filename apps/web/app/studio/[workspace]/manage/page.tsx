import { Manage } from '../../../../components/studio/manage';
export const metadata = { title: 'Manage | Guide studio', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <Manage workspaceId={workspace} />;
}
