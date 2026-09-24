import { expect, it, vi } from 'vitest';
import { hashCredentialPassword } from '@guide/database';
import { ApplicationError } from '@guide/contracts';
const mocks = vi.hoisted(() => ({ hash: '', change: vi.fn() }));
vi.mock('./application', () => ({
  currentSession: async () => ({
    user: { id: 'account', active: true },
    session: { id: 'kept-session' },
  }),
  enforceRateLimit: async () => {},
  getApplication: () => ({
    origin: 'http://127.0.0.1:3100',
    identity: {
      api: {
        changePassword: async () => {
          throw new Error('database busy');
        },
      },
    },
    store: {
      currentPasswordHash: async () => mocks.hash,
      changeOwnPassword: mocks.change,
      clearPasswordChangeRequirement: async () => {},
    },
  }),
}));
import { POST } from '../app/api/studio/password/route';

it('reports a busy account as busy rather than an incorrect password', async () => {
  mocks.hash = await hashCredentialPassword('current-password');
  mocks.change.mockRejectedValue(
    new ApplicationError('BUSY', 'This account is busy. Try again shortly.', 503),
  );
  const response = await POST(
    new Request('http://127.0.0.1:3100/api/studio/password', {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3100', 'content-type': 'application/json' },
      body: JSON.stringify({
        currentPassword: 'current-password',
        newPassword: 'replacement-password',
      }),
    }),
  );
  expect(response.status).toBe(503);
});
