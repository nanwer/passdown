import { SignIn } from '../../components/studio/pages';
import { defaultLoginActive } from '../../lib/setup';
import { getApplication, isConfigured } from '../../lib/application';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const configured = isConfigured();
  return (
    <SignIn
      defaultLogin={configured && (await defaultLoginActive())}
      origin={configured ? getApplication().origin : undefined}
    />
  );
}
