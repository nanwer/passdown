/**
 * Pieces the public pages share: the library, a thing's page, the reader and
 * the not-found page.
 */
export const pageWidth = 'mx-auto w-[min(100%_-_2_*_var(--gp-semantic-space-page),1280px)]';
export const eyebrow =
  'flex items-center gap-2 font-mono text-[10px] font-medium tracking-[1.6px] text-muted uppercase';
export const textLink =
  'inline-flex items-center gap-[11px] text-[12px] font-bold hover:underline hover:underline-offset-[5px]';
export const notFound =
  'flex min-h-[75vh] flex-col items-start gap-5.5 py-25 [&_h1]:text-[clamp(30px,4vw,48px)] [&_h1]:leading-[1.25] [&_h1]:font-medium [&_h1]:tracking-[-1.5px] [&_p]:text-muted';
