// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ResetPassword } from './reset-password';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows the account and directs a mismatch to password confirmation', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            email: 'reader@test.local',
            name: 'Reader',
            expiresAt: '2026-10-01T10:00:00Z',
            signedInAs: null,
          }),
        ),
      ),
    ),
  );
  render(<ResetPassword token={'a'.repeat(43)} />);
  expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'new-password-123' },
  });
  fireEvent.change(screen.getByLabelText('New password again'), {
    target: { value: 'different-password' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'Set password and sign in' }).closest('form')!,
  );
  expect(screen.getByLabelText('New password again').getAttribute('aria-invalid')).toBe('true');
  expect(document.activeElement).toBe(screen.getByLabelText('New password again'));
  expect(screen.getByText('Those two do not match.')).toBeTruthy();
});
