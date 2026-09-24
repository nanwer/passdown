import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  required: true,
  hash: Buffer.alloc(32),
  outcome: { outcome: 'created', workspace: 'workshop' },
  reconciliation: 'complete',
  signIn: vi.fn(),
  completeSetup: vi.fn(),
  reconcileSetup: vi.fn(),
  rate: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./application', () => ({
  isConfigured: () => true,
  getApplication: () => ({
    origin: 'https://example.org',
    store: {
      setupRequired: async () => state.required,
      completeSetup: state.completeSetup,
      reconcileSetup: state.reconcileSetup,
    },
    identity: { api: { signInEmail: state.signIn } },
  }),
  enforceRateLimit: state.rate,
}));
vi.mock('./deployment', () => ({ deploymentStatus: () => ({ setupCodeHash: state.hash }) }));
// Keep availability isolated per request; the production helper caches only completion.
vi.mock('./setup', async (importOriginal) => {
  const original = await importOriginal<typeof import('./setup')>();
  return { ...original, setupRequired: async () => state.required };
});
import { POST } from '../app/api/setup/route';
const code = '12345-67890-ABCDE-FGHJK';
const input = {
  code,
  name: 'Owner',
  email: 'Owner@Example.org',
  password: 'a long test password',
  workspaceName: 'Workshop',
};
const request = (body: unknown = input, origin = 'https://example.org') =>
  new Request('https://example.org/api/setup', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.required = true;
  state.hash = createHash('sha256').update(code.replaceAll('-', '')).digest();
  state.completeSetup.mockResolvedValue({ outcome: 'created', workspace: 'workshop' });
  state.reconcileSetup.mockResolvedValue('complete');
  state.signIn.mockResolvedValue(
    new Response('{}', { headers: { 'Set-Cookie': 'session=test; HttpOnly' } }),
  );
});
it('requires a configured origin and correct code before account creation', async () => {
  expect((await POST(request(input, 'https://attacker.org'))).status).toBe(403);
  expect((await POST(request({ ...input, code: 'wrong' }))).status).toBe(403);
  expect(state.completeSetup).not.toHaveBeenCalled();
});
it('canonicalizes email and returns the sign-in session', async () => {
  const result = await POST(request());
  expect(result.status).toBe(201);
  expect(result.headers.get('set-cookie')).toContain('HttpOnly');
  expect(state.completeSetup).toHaveBeenCalledWith(
    expect.objectContaining({ email: 'owner@example.org' }),
  );
  expect(state.completeSetup.mock.calls[0][0]).not.toHaveProperty('code');
});
it('closes setup permanently after an account exists', async () => {
  state.required = false;
  expect((await POST(request())).status).toBe(404);
  expect(state.completeSetup).not.toHaveBeenCalled();
});
it.each(['complete', 'empty', 'other-account'])(
  'reconciles uncertain commits: %s',
  async (value) => {
    state.completeSetup.mockResolvedValue({ outcome: 'uncertain' });
    state.reconcileSetup.mockResolvedValue(value);
    const response = await POST(request());
    expect(response.status).toBe(value === 'complete' ? 201 : value === 'empty' ? 503 : 404);
    expect(state.signIn).not.toHaveBeenCalled();
  },
);
it('tells the person to reload if commit reconciliation is unavailable', async () => {
  state.completeSetup.mockResolvedValue({ outcome: 'uncertain' });
  state.reconcileSetup.mockRejectedValue(Error('private detail'));
  const response = await POST(request());
  expect((await response.json()).error.code).toBe('SETUP_OUTCOME_UNKNOWN');
});
it('keeps a committed account when automatic sign-in fails', async () => {
  state.signIn.mockRejectedValue(Error('session unavailable'));
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ signIn: 'manual' });
});
