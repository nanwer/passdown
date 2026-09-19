import { EditorPage } from '../../../../components/studio/editor';
export const metadata = {
  title: 'Edit guide | Guide studio',
  robots: { index: false, follow: false },
};
export default async function Page({
  params,
}: {
  params: Promise<{ workspace: string; guide: string }>;
}) {
  const { workspace, guide } = await params;
  return <EditorPage workspaceId={workspace} guideId={guide} />;
}
