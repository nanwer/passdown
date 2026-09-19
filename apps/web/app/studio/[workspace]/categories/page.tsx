import { CategoryManagementPage } from '../../../../components/structured';
export const metadata = {
  title: 'Categories | Guide studio',
  robots: { index: false, follow: false },
};
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <CategoryManagementPage workspaceId={workspace} />;
}
