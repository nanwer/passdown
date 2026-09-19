import { CatalogManagementPage } from '../../../../components/structured';
export const metadata = {
  title: 'Tools and materials | Guide studio',
  robots: { index: false, follow: false },
};
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <CatalogManagementPage workspaceId={workspace} />;
}
