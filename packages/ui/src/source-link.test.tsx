// @vitest-environment jsdom
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { SourceCodeLink, SourceLinkProvider } from './source-link';
afterEach(cleanup);
it('renders the supplied source as an ordinary accessible link', () => {
  render(
    <SourceLinkProvider href="https://example.org/source">
      <SourceCodeLink />
    </SourceLinkProvider>,
  );
  expect(screen.getByRole('link', { name: 'Source code' }).getAttribute('href')).toBe(
    'https://example.org/source',
  );
});
it('omits a link when no source provider is present', () => {
  render(<SourceCodeLink />);
  expect(screen.queryByRole('link')).toBeNull();
});
