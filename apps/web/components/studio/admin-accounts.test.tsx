// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminAccounts } from './admin-accounts';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('shows a reset link once and removes it when cancelled', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation((path: string, init?: RequestInit) =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              path === '/api/studio/session'
                ? {
                    user: { id: 'admin', name: 'Admin', email: 'admin@test.local' },
                    workspaces: [],
                    isAdministrator: true,
                  }
                : path.includes('/password-reset')
                  ? init?.method === 'DELETE'
                    ? { cancelled: true }
                    : {
                        link: 'http://127.0.0.1:3100/reset/' + 'a'.repeat(43),
                        expiresAt: '2026-10-01T10:00:00Z',
                      }
                  : {
                      accounts: [
                        {
                          id: 'reader',
                          name: 'Reader',
                          email: 'reader@test.local',
                          status: 'active',
                          workspaces: [],
                          isYou: false,
                          isAdministrator: false,
                          pendingReset: null,
                          mustChangePassword: false,
                        },
                      ],
                      total: 1,
                      limit: 100,
                    },
            ),
          ),
        ),
      ),
  );
  render(<AdminAccounts />);
  fireEvent.click(await screen.findByRole('button', { name: 'Create reset link for Reader' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create link' }));
  expect(await screen.findByRole('textbox', { name: 'Reset link for Reader' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel this link' }));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Reset link for Reader' })).toBeNull(),
  );
  expect(screen.getByText('Link cancelled. It no longer works.')).toBeTruthy();
});
