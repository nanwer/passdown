import { notFound } from 'next/navigation';
import { AdminAccounts } from '../../../components/studio/admin-accounts';
import { currentActor, getApplication, isConfigured } from '../../../lib/application';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Accounts · Administration',
  robots: { index: false, follow: false },
};
export default async function Page() {
  if (isConfigured()) {
    const actor = await currentActor();
    if (actor.kind === 'user' && !(await getApplication().store.isInstallationAdministrator(actor)))
      notFound();
  }
  return <AdminAccounts />;
}
