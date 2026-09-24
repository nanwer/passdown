// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SetupScreen } from './setup-screen';
import { NotConfigured } from './not-configured';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function fill() {
  for (const [label, value] of [
    ['Setup code', '12345-67890-ABCDE-FGHJK'],
    ['Your name', 'Owner'],
    ['Email', 'Owner@Example.org'],
    ['Password', 'long test password'],
    ['Confirm password', 'long test password'],
    ['Workspace name', 'Workshop'],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
it('provides an isolated not-configured page with no navigation', () => {
  render(<NotConfigured />);
  expect(screen.getAllByRole('main')).toHaveLength(1);
  expect(screen.queryByRole('link')).toBeNull();
});
it('keeps the setup code in a POST body and focuses wrong-code errors', async () => {
  const fetcher = vi.fn(async (_url: string, _options?: RequestInit) =>
    Response.json(
      { error: { code: 'SETUP_CODE_INVALID', message: 'Check your code.' } },
      { status: 403 },
    ),
  );
  vi.stubGlobal('fetch', fetcher);
  render(<SetupScreen />);
  fill();
  expect(screen.getByRole('button', { name: 'Create installation' }).closest('form')?.method).toBe(
    'post',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create installation' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Check your code.'));
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/setup');
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Setup code')));
});
it('does not submit mismatched passwords and restores focus', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<SetupScreen />);
  fill();
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: 'different password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create installation' }));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText('Confirm password')),
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it.each([429, 503])(
  'handles a non-JSON upstream %s response without losing entered data',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('upstream error', { status })),
    );
    render(<SetupScreen />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: 'Create installation' }));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        status === 429 ? 'Too many attempts' : 'Setup may have finished',
      ),
    );
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('Owner@Example.org');
  },
);
it('offers sign-in after a successful commit with manual session recovery', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ signIn: 'manual' }, { status: 201 })),
  );
  render(<SetupScreen />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create installation' }));
  expect((await screen.findByRole('link', { name: 'Sign in' })).getAttribute('href')).toBe(
    '/sign-in',
  );
  expect(screen.queryByLabelText('Password')).toBeNull();
});

it('announces a pending submission and prevents editing until it completes', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  render(<SetupScreen />);
  fill();
  fireEvent.click(screen.getByRole('button', { name: 'Create installation' }));
  const button = screen.getByRole('button', { name: 'Setting up…' });
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect((screen.getByLabelText('Email') as HTMLInputElement).readOnly).toBe(true);
  finish(Response.json({ error: { message: 'Try again.' } }, { status: 503 }));
  await screen.findByRole('button', { name: 'Create installation' });
});
