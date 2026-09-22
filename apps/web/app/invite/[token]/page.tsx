import { AcceptInvitation } from '../../../components/studio/accept-invitation';
export const metadata = {
  title: 'Accept an invitation',
  // An invitation link is a secret. Keeping it out of indexes is the least of
  // what that means, but it is free.
  robots: { index: false, follow: false },
};
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AcceptInvitation token={token} />;
}
