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
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
