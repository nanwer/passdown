import { NewGuide } from '../../../../components/studio/pages';
export const metadata = {
  title: 'New guide · Studio',
  robots: { index: false, follow: false },
};
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <NewGuide workspaceId={workspace} />;
}
