import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  handler: vi.fn(),
  reached: vi.fn(),
  consume: vi.fn(),
  clear: vi.fn(),
}));
vi.mock('./application', () => {
  const app = {
    origin: 'http://127.0.0.1:3100',
    identity: { handler: m.handler },
    store: { rateLimitReached: m.reached, consumeRateLimit: m.consume, clearRateLimit: m.clear },
  };
  return { getApplication: () => app };
});
import { GET, POST } from '../app/api/auth/[...all]/route';
const origin = 'http://127.0.0.1:3100';
const context = (path: string) => ({ params: Promise.resolve({ all: path.split('/') }) });
const signIn = () =>
  POST(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'person@test.local', password: 'synthetic-password' }),
    }),
    context('sign-in/email'),
  );
beforeEach(() => {
  vi.resetAllMocks();
  m.reached.mockResolvedValue(false);
});

it('does not expose the session endpoint, which would hand page scripts the session token', async () => {
  const response = await GET();
  expect(response.status).toBe(404);
  expect(m.handler).not.toHaveBeenCalled();
});

it('keeps the session cookies but leaves the session token out of the sign-in body', async () => {
  const headers = new Headers({ 'content-type': 'application/json' });
  headers.append('set-cookie', 'session_token=synthetic; HttpOnly; Path=/');
  headers.append('set-cookie', 'session_data=synthetic; HttpOnly; Path=/');
  m.handler.mockResolvedValue(
    new Response(
      JSON.stringify({ redirect: false, token: 'synthetic-session-token', user: { id: 'person' } }),
      { status: 200, headers },
    ),
  );
  const response = await signIn();
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text).not.toContain('synthetic-session-token');
  expect(JSON.parse(text)).toEqual({ redirect: false, user: { id: 'person' } });
  expect(response.headers.getSetCookie()).toEqual([
    'session_token=synthetic; HttpOnly; Path=/',
    'session_data=synthetic; HttpOnly; Path=/',
  ]);
  expect(m.clear).toHaveBeenCalledOnce();
});

it('counts a refused sign-in, such as a suspended account, and never clears the counter', async () => {
  m.handler.mockResolvedValue(
    Response.json(
      { code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
      { status: 401 },
    ),
  );
  const response = await signIn();
  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(m.consume).toHaveBeenCalledTimes(2);
  expect(m.clear).not.toHaveBeenCalled();
});

it('passes a response without a token, such as sign-out, through intact', async () => {
  m.handler.mockResolvedValue(
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'set-cookie': 'session_token=; Max-Age=0; Path=/' },
    }),
  );
  const response = await POST(
    new Request(`${origin}/api/auth/sign-out`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body: '{}',
    }),
    context('sign-out'),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true });
  expect(response.headers.getSetCookie()).toEqual(['session_token=; Max-Age=0; Path=/']);
});
