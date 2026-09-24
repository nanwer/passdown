import { createHash } from 'node:crypto';
import { ApplicationError } from '@guide/contracts';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  required: true,
  hash: Buffer.alloc(32) as Buffer | undefined,
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
  state.rate.mockResolvedValue(undefined);
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
it('throttles incorrect codes before creating accounts or sessions', async () => {
  state.rate.mockRejectedValue(new ApplicationError('RATE_LIMITED', 'Wait before retrying.', 429));
  const response = await POST(request({ ...input, code: 'wrong' }));
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
  expect(state.completeSetup).not.toHaveBeenCalled();
  expect(state.signIn).not.toHaveBeenCalled();
});
it('keeps correct-code setup available after incorrect attempts exhaust the shared limit', async () => {
  let attempts = 0;
  state.rate.mockImplementation(async () => {
    if (++attempts > 30) throw new ApplicationError('RATE_LIMITED', 'Wait before retrying.', 429);
  });
  const statuses = [];
  for (let attempt = 0; attempt < 31; attempt++)
    statuses.push((await POST(request({ ...input, code: 'wrong' }))).status);
  const response = await POST(request());
  expect({
    statuses,
    completed: response.status,
    accountsCreated: state.completeSetup.mock.calls.length,
    sessionsCreated: state.signIn.mock.calls.length,
    buckets: state.rate.mock.calls,
  }).toEqual({
    statuses: [...Array(30).fill(403), 429],
    completed: 201,
    accountsCreated: 1,
    sessionsCreated: 1,
    buckets: Array.from({ length: 31 }, () => ['setup:failures', 30]),
  });
});
it('refuses setup when the operator has not configured a code hash', async () => {
  state.hash = undefined;
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect((await response.json()).error.code).toBe('SETUP_CODE_MISSING');
  expect(state.completeSetup).not.toHaveBeenCalled();
});
it.each([
  [
    'missing field',
    JSON.stringify({ ...input, workspaceName: undefined }),
    'application/json',
    422,
  ],
  ['unknown field', JSON.stringify({ ...input, administrator: true }), 'application/json', 422],
  ['non-JSON media', JSON.stringify(input), 'text/plain', 415],
  ['malformed JSON', '{', 'application/json', 400],
  [
    'oversized streamed body',
    JSON.stringify({ ...input, code: 'x'.repeat(17_000) }),
    'application/json',
    413,
  ],
])('rejects %s before creating accounts', async (_name, body, contentType, status) => {
  const response = await POST(
    new Request('https://example.org/api/setup', {
      method: 'POST',
      headers: { origin: 'https://example.org', 'Content-Type': contentType },
      // No Content-Length: enforce the size while consuming the body itself.
      body,
    }),
  );
  expect(response.status).toBe(status);
  expect(state.completeSetup).not.toHaveBeenCalled();
  expect(state.signIn).not.toHaveBeenCalled();
});
it('normalizes a pasted setup code before verifying it', async () => {
  expect((await POST(request({ ...input, code: ' l2345 6789o abcde fghjk ' }))).status).toBe(201);
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
    expect(state.completeSetup).toHaveBeenCalledTimes(1);
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

it('explains a workspace without accounts without signing in or reporting success', async () => {
  state.completeSetup.mockResolvedValue({ outcome: 'workspace-exists' });
  const response = await POST(request());
  expect({
    status: response.status,
    code: (await response.json()).error?.code,
    signIns: state.signIn.mock.calls.length,
  }).toEqual({ status: 503, code: 'SETUP_WORKSPACE_EXISTS', signIns: 0 });
});
