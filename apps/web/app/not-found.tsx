import { AppShell } from '@guide/ui';
import { ArrowLeft, BookOpen } from 'lucide-react';
export default function NotFound() {
  return (
    <AppShell>
      <main id="main" className="not-found page-width" tabIndex={-1}>
        <BookOpen size={38} />
        <div className="eyebrow">NOT AVAILABLE</div>
        <h1>We couldn’t find that guide.</h1>
        <p>The link may have changed, or this content may not be available to you.</p>
        <a className="button button--primary" href="/">
          <ArrowLeft size={16} />
          Back to the library
        </a>
      </main>
    </AppShell>
  );
}
