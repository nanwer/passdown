import { ApplicationError } from '@guide/contracts';
import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  session: {
    user: { id: 'default', active: true, mustChangePassword: true },
    session: { id: 'this-browser' },
  } as unknown,
  finishSetup: vi.fn(),
  limits: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('./application', () => ({
  getApplication: () => ({
    origin: 'https://example.org',
    store: { finishSetup: state.finishSetup },
  }),
  currentSession: async () => state.session,
  enforceMutationLimits: state.limits,
}));
import { POST } from '../app/api/setup/route';

const input = {
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
  state.session = {
    user: { id: 'default', active: true, mustChangePassword: true },
    session: { id: 'this-browser' },
  };
  state.limits.mockResolvedValue(undefined);
  state.finishSetup.mockResolvedValue({ workspace: 'workshop', sessionsEnded: 0 });
});

it('finishes setting up for the signed-in default login and keeps this session', async () => {
  const response = await POST(request());
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ workspace: 'workshop' });
  expect(state.limits).toHaveBeenCalledWith('default');
  expect(state.finishSetup).toHaveBeenCalledWith(
    { kind: 'user', id: 'default', active: true },
    { ...input, keepSessionId: 'this-browser' },
  );
});

it('refuses another origin and a signed-out request before touching the account', async () => {
  const foreign = await POST(request(input, 'https://attacker.example'));
  expect(foreign.status).toBe(403);
  // The message says which address Passdown is set up for.
  expect((await foreign.json()).error.message).toContain('https://example.org');
  state.session = null;
  expect((await POST(request())).status).toBe(401);
  expect(state.finishSetup).not.toHaveBeenCalled();
});

it('refuses the default address and a short password with field issues', async () => {
  for (const [body, path] of [
    [{ ...input, email: 'ADMIN@example.com' }, 'email'],
    [{ ...input, password: 'short' }, 'password'],
    [{ ...input, code: 'OLD-SETUP-CODE' }, ''],
  ] as const) {
    const response = await POST(request(body));
    expect(response.status).toBe(422);
    const error = (await response.json()).error;
    if (path) expect(error.issues.map((issue: { path: string }) => issue.path)).toContain(path);
  }
  expect(state.finishSetup).not.toHaveBeenCalled();
});

it('says setup is already finished when the account is not the default login', async () => {
  state.finishSetup.mockRejectedValue(new ApplicationError('NOT_FOUND', 'Account not found.', 404));
  const response = await POST(request());
  expect(response.status).toBe(404);
  expect((await response.json()).error).toMatchObject({
    code: 'SETUP_FINISHED',
    message: 'Passdown is already set up. Sign in with your own email address.',
  });
});

it('passes on a taken address and a busy account unchanged', async () => {
  for (const error of [
    new ApplicationError('EMAIL_TAKEN', 'Another account already uses that email address.', 409),
    new ApplicationError('BUSY', 'This account is busy. Try again shortly.', 503),
  ]) {
    state.finishSetup.mockRejectedValueOnce(error);
    const response = await POST(request());
    expect(response.status).toBe(error.status);
    expect((await response.json()).error.code).toBe(error.code);
  }
});
