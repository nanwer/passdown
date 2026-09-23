import { CatalogManagementPage } from '../../../../components/structured';
export const metadata = {
  title: 'Catalog · Studio',
  robots: { index: false, follow: false },
};
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <CatalogManagementPage workspaceId={workspace} />;
}
