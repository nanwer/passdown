import { redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
/**
 * The old setup-code form's address. Setup now happens after signing in with
 * the default login; the studio shows Finish setting up, or asks to sign in.
 */
export default function SetupPage() {
  redirect('/studio');
}
