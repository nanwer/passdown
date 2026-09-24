import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  describe: vi.fn(),
  redeem: vi.fn(),
  list: vi.fn(),
  issue: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('./application', () => {
  const store = {
    describePasswordReset: m.describe,
    redeemPasswordReset: m.redeem,
    listAccountsForAdministrator: m.list,
    adminIssuePasswordReset: m.issue,
    adminCancelPasswordReset: m.cancel,
  };
  const actor = { kind: 'user', id: 'admin', active: true };
  const app = {
    store,
    origin: 'http://127.0.0.1:3100',
    identity: {
      api: {
        signInEmail: async () =>
          new Response('{}', { headers: { 'set-cookie': 'session=synthetic; HttpOnly' } }),
      },
    },
  };
  return {
    getApplication: () => app,
    currentSession: async () => null,
    enforceRateLimit: async () => {},
    requireSession: async () => ({ actor }),
    mutationContext: async () => ({ ...app, actor }),
  };
});
import { GET, POST } from '../app/api/password-resets/[token]/route';
import { GET as accounts } from '../app/api/admin/accounts/route';
import {
  POST as issue,
  DELETE as cancel,
} from '../app/api/admin/accounts/[account]/password-reset/route';
const token = 'a'.repeat(43);
it('previews a valid reset and forwards the new sign-in cookie after redemption', async () => {
  m.describe.mockResolvedValue({
    userId: 'reader',
    email: 'reader@test.local',
    name: 'Reader',
    expiresAt: '2026-10-01T10:00:00Z',
  });
  m.redeem.mockResolvedValue('reader');
  expect(
    (
      await GET(new Request(`http://127.0.0.1:3100/api/password-resets/${token}`), {
        params: Promise.resolve({ token }),
      })
    ).status,
  ).toBe(200);
  const response = await POST(
    new Request(`http://127.0.0.1:3100/api/password-resets/${token}`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1:3100', 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'replacement-password' }),
    }),
    { params: Promise.resolve({ token }) },
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toContain('session=synthetic');
});
it('lists accounts and returns a reset link only on creation', async () => {
  m.list.mockResolvedValue({ accounts: [], total: 0, limit: 100 });
  m.issue.mockResolvedValue({ token, expiresAt: '2026-10-01T10:00:00Z' });
  m.cancel.mockResolvedValue(undefined);
  expect((await accounts(new Request('http://127.0.0.1:3100/api/admin/accounts'))).status).toBe(
    200,
  );
  const context = { params: Promise.resolve({ account: 'reader' }) };
  const response = await issue(
    new Request('http://127.0.0.1:3100/api/admin/accounts/reader/password-reset', {
      method: 'POST',
    }),
    context,
  );
  expect(response.status).toBe(201);
  expect((await response.json()).link).toBe(`http://127.0.0.1:3100/reset/${token}`);
  expect(
    (
      await cancel(
        new Request('http://127.0.0.1:3100/api/admin/accounts/reader/password-reset', {
          method: 'DELETE',
        }),
        context,
      )
    ).status,
  ).toBe(200);
});
