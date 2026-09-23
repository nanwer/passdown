'use client';
import * as P from '../components/public-styles';
import { Button } from '@guide/ui';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className={`${P.notFound} ${P.pageWidth}`} tabIndex={-1}>
      <h1>The page didn’t load.</h1>
      <p>Please try again. Your content has not been changed.</p>
      <Button onClick={reset}>Try again</Button>
      <a href="/">Return to the library</a>
    </main>
  );
}
