import { notFound } from 'next/navigation';
import { setupRequired } from '../../lib/setup';
import { SetupScreen } from '../../components/setup/setup-screen';
export const dynamic = 'force-dynamic';
export default async function SetupPage() {
  if (!(await setupRequired())) notFound();
  return <SetupScreen />;
}
