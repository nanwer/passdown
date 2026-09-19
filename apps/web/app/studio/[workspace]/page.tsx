import { WorkspacePage } from '../../../components/studio/pages';
export const metadata = {
  title: 'Your guides | Guide studio',
  robots: { index: false, follow: false },
};
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <WorkspacePage workspaceId={workspace} />;
}
