import { People } from '../../../../components/studio/people';
export const metadata = { title: 'People | Guide studio', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <People workspaceId={workspace} />;
}
