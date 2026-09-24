// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ChangePassword } from './frame';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('clears the fields and permits a second successful change without remounting', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify({ changed: true }), { status: 200 })),
  );
  const changed = vi.fn();
  render(<ChangePassword onChanged={changed} />);
  for (let n = 1; n <= 2; n++) {
    fireEvent.change(screen.getByLabelText('Current password'), {
      target: { value: 'current-password' },
    });
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'replacement-password' },
    });
    fireEvent.change(screen.getByLabelText('New password again'), {
      target: { value: 'replacement-password' },
    });
    fireEvent.submit(screen.getByRole('button', { name: 'Change password' }).closest('form')!);
    await waitFor(() => expect(changed).toHaveBeenCalledTimes(n));
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('button', { name: 'Change password' }).hasAttribute('disabled')).toBe(
      false,
    );
  }
});
it('labels the account form and announces successful changes', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 }))),
  );
  render(<ChangePassword forced={false} />);
  expect(screen.getByRole('heading', { name: 'Your account' })).toBeTruthy();
  const status = screen.getByRole('status');
  expect(status.textContent).toBe('');
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'current-password' },
  });
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'replacement-password' },
  });
  fireEvent.change(screen.getByLabelText('New password again'), {
    target: { value: 'replacement-password' },
  });
  fireEvent.submit(screen.getByRole('button', { name: 'Change password' }).closest('form')!);
  await waitFor(() =>
    expect(status.textContent).toBe('Password changed. You are still signed in here.'),
  );
});
it('associates a wrong-current-password response with its field and focuses it', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'VALIDATION_ERROR', message: 'That current password is not right.' },
            }),
            { status: 422 },
          ),
        ),
      ),
  );
  render(<ChangePassword forced={false} />);
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'current-password' },
  });
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'replacement-password' },
  });
  fireEvent.change(screen.getByLabelText('New password again'), {
    target: { value: 'replacement-password' },
  });
  fireEvent.submit(screen.getByRole('button', { name: 'Change password' }).closest('form')!);
  await waitFor(() =>
    expect(screen.getByLabelText('Current password').getAttribute('aria-invalid')).toBe('true'),
  );
  expect(document.activeElement).toBe(screen.getByLabelText('Current password'));
});
