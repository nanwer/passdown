// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FinishSetup } from './finish-setup';
import { NoAccount, NotConfigured } from './not-configured';
import { SessionGate } from '../studio/frame';
import { SignIn } from '../studio/pages';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function fill(values: Record<string, string> = {}) {
  for (const [label, value] of Object.entries({
    'Your name': 'Owner',
    'Your email address': 'Owner@Example.org',
    'New password': 'long test password',
    'New password again': 'long test password',
    'Workspace name': 'Workshop',
    ...values,
  }))
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Finish setting up' }));

it('provides isolated pages for unconfigured and account-less installations', () => {
  for (const page of [<NotConfigured key="a" />, <NoAccount key="b" />]) {
    render(page);
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByRole('link')).toBeNull();
    cleanup();
  }
});

it('sends the new account and workspace in a POST body, without the confirmation', async () => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) =>
    Response.json({ workspace: 'workshop' }, { status: 201 }),
  );
  vi.stubGlobal('fetch', fetcher);
  const assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
  render(<FinishSetup />);
  expect(screen.getByLabelText('Your name')).toHaveFocus();
  fill();
  submit();
  await waitFor(() => expect(assign).toHaveBeenCalledWith('/studio'));
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/setup');
  expect(fetcher.mock.calls[0]?.[1]?.method).toBe('POST');
  expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
    name: 'Owner',
    email: 'Owner@Example.org',
    password: 'long test password',
    workspaceName: 'Workshop',
  });
});

it('refuses the default address, mismatched and short passwords before sending', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<FinishSetup />);
  fill({ 'Your email address': 'admin@example.com' });
  submit();
  await waitFor(() => expect(screen.getByLabelText('Your email address')).toHaveFocus());
  expect(screen.getByLabelText('Your email address')).toHaveAccessibleDescription(
    'Use your own email address, not admin@example.com.',
  );
  fill({ 'New password again': 'something else entirely' });
  submit();
  await waitFor(() => expect(screen.getByLabelText('New password again')).toHaveFocus());
  fill({ 'New password': 'short', 'New password again': 'short' });
  submit();
  await waitFor(() => expect(screen.getByLabelText('New password')).toHaveFocus());
  expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
    'Use at least 12 characters. Between 12 and 200 characters.',
  );
  expect(fetcher).not.toHaveBeenCalled();
});

it('keeps what was typed when the server refuses, and focuses the field it names', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        {
          error: {
            code: 'EMAIL_TAKEN',
            message: 'Another account already uses that email address.',
          },
        },
        { status: 409 },
      ),
    ),
  );
  render(<FinishSetup />);
  fill();
  submit();
  await waitFor(() => expect(screen.getByLabelText('Your email address')).toHaveFocus());
  expect(screen.getByRole('alert')).toHaveTextContent('Another account already uses');
  expect(screen.getByLabelText('Workspace name')).toHaveValue('Workshop');
});

it('announces a pending submission and prevents editing until it completes', async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))),
  );
  render(<FinishSetup />);
  fill();
  submit();
  const button = screen.getByRole('button', { name: 'Finishing…' });
  expect(button).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByLabelText('Your name')).toHaveAttribute('readonly');
  finish(new Response('upstream error', { status: 503 }));
  await screen.findByRole('button', { name: 'Finish setting up' });
  expect(screen.getByRole('alert')).toHaveTextContent('Nothing was changed');
});

it('offers sign-in when setup was already finished elsewhere', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { error: { code: 'SETUP_FINISHED', message: 'Passdown is already set up.' } },
        { status: 404 },
      ),
    ),
  );
  render(<FinishSetup />);
  fill();
  submit();
  expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
  expect(screen.queryByLabelText('New password')).toBeNull();
});

it('shows only Finish setting up and sign-out to the default login', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      Response.json(
        { error: { code: 'SETUP_REQUIRED', message: 'Finish setting up Passdown.' } },
        { status: 403 },
      ),
    ),
  );
  render(<SessionGate>{() => <p>Studio content</p>}</SessionGate>);
  expect(
    await screen.findByRole('heading', { name: 'Finish setting up Passdown' }),
  ).toBeInTheDocument();
  expect(screen.queryByText('Studio content')).toBeNull();
  expect(screen.queryByRole('link', { name: /Studio|Administration/ })).toBeNull();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
});

it('offers the default login on the sign-in page only while it is active', () => {
  const { unmount } = render(<SignIn defaultLogin origin="http://localhost:3000" />);
  expect(screen.getByText(/First time\?/)).toHaveTextContent(
    'First time? Sign in with admin@example.com and changeme.',
  );
  unmount();
  render(<SignIn defaultLogin={false} origin="http://localhost:3000" />);
  expect(screen.queryByText(/First time\?/)).toBeNull();
});

it('names the configured address when the sign-in page is opened at another one', async () => {
  render(<SignIn defaultLogin={false} origin="https://guides.example.org" />);
  expect(await screen.findByText(/Passdown is set up for/)).toHaveTextContent(
    `Passdown is set up for https://guides.example.org. Open it at that address, or ask the operator to set PASSDOWN_URL to ${window.location.origin}.`,
  );
});
