import { YourAccount } from '../../components/studio/account';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Your account', robots: { index: false, follow: false } };
export default function Page() {
  return <YourAccount />;
}
