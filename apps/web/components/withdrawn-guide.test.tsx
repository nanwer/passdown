import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WithdrawnGuide } from './withdrawn-guide';
it('shows an anonymous notice without guide content and an optional manager link', () => {
  const html = renderToStaticMarkup(
    <WithdrawnGuide libraryHref="/" editHref="/studio/one/guide" />,
  );
  expect(html).toContain('<h1>This guide has been withdrawn</h1>');
  expect(html).toContain('Its instructions are no longer available.');
  expect(html).toContain('href="/studio/one/guide"');
  expect(html).toContain('id="main"');
});
