import { connection } from 'next/server';
import { SourceLinkProvider } from '@guide/ui';
import { deploymentStatus } from '../lib/deployment';
import { setupRequired } from '../lib/setup';
import { sourceCodeURL } from '../lib/source';
import { SetupScreen } from '../components/setup/setup-screen';
import { NotConfigured } from '../components/setup/not-configured';
import type { Metadata } from 'next';
import '@fontsource/geist-sans/400.css';
import '@fontsource/geist-sans/500.css';
import '@fontsource/geist-sans/600.css';
import '@fontsource/geist-sans/700.css';
import '@fontsource/geist-mono/400.css';
import '@guide/design-tokens/tokens.css';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'Passdown — practical knowledge, passed on', template: '%s · Passdown' },
  description:
    'Preserve practical knowledge with step-by-step guides for public communities and private teams.',
  robots: { index: false, follow: false },
};
const themeBoot = `(function(){try{var t=localStorage.getItem('guide-theme');document.documentElement.dataset.theme=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'}catch(e){}})()`;
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const status = deploymentStatus();
  if (status.production) await connection();
  const gate =
    status.production && !status.configured
      ? 'not-configured'
      : (await setupRequired())
        ? 'setup'
        : null;
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <SourceLinkProvider href={sourceCodeURL()}>
          {gate === 'not-configured' ? (
            <NotConfigured />
          ) : gate === 'setup' ? (
            <SetupScreen />
          ) : (
            children
          )}
        </SourceLinkProvider>
      </body>
    </html>
  );
}
