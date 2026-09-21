import { CategoryManagementPage } from '../../../../components/structured';
import { words } from '../../../../lib/vocabulary';
export const metadata = {
  title: `${words.Things} | Guide studio`,
  robots: { index: false, follow: false },
};
export default async function Page({ params }: { params: Promise<{ workspace: string }> }) {
  const { workspace } = await params;
  return <CategoryManagementPage workspaceId={workspace} />;
}
