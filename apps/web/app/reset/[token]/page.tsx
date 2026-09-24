import { ResetPassword } from '../../../components/studio/reset-password';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Choose a new password', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ResetPassword token={token} />;
}
