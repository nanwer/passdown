// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PublicationControls } from './publication-controls';
import type { DraftGuide } from '@guide/contracts';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('withdraws the observed release and revision with a private reason', async () => {
  const guide = {
    id: 'guide',
    workspaceId: 'public',
    state: 'published',
    audience: 'public',
    currentRelease: 1,
    publicationRevision: 4,
  } as DraftGuide;
  const fetch = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ guide: { ...guide, state: 'withdrawn', publicationRevision: 5 } }),
        ),
      ),
    );
  vi.stubGlobal('fetch', fetch);
  const changed = vi.fn();
  render(<PublicationControls guide={guide} busy={false} onChanged={changed} />);
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw…' }));
  fireEvent.change(screen.getByLabelText('Reason (optional)'), {
    target: { value: 'Outdated instructions' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw release 1' }));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
    expectedRelease: 1,
    expectedPublicationRevision: 4,
    reason: 'Outdated instructions',
  });
  expect(screen.getByRole('status').textContent).toContain('Readers can no longer open it.');
});
