import type { Metadata } from 'next';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
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
