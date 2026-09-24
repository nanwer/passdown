import { AppShell, buttonVariants } from '@guide/ui';
import { ArrowLeft, BookX } from 'lucide-react';
import * as P from './public-styles';
export function WithdrawnGuide({
  libraryHref,
  editHref,
  workspaceLabel = 'Public guides',
}: {
  libraryHref: string;
  editHref?: string;
  workspaceLabel?: string;
}) {
  return (
    <AppShell libraryHref={libraryHref} workspaceLabel={workspaceLabel}>
      <main id="main" tabIndex={-1} className={`${P.notFound} ${P.pageWidth}`}>
        <BookX size={38} aria-hidden="true" />
        <div className={P.eyebrow}>WITHDRAWN</div>
        <h1>This guide has been withdrawn</h1>
        <p>Its instructions are no longer available.</p>
        <a className={buttonVariants()} href={libraryHref}>
          <ArrowLeft size={16} aria-hidden="true" />
          Back to the library
        </a>
        {editHref && (
          <a className={buttonVariants({ variant: 'secondary' })} href={editHref}>
            Open in studio
          </a>
        )}
      </main>
    </AppShell>
  );
}
