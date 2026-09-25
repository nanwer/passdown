import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({
  session: null as unknown,
  defaultAccount: null as string | null,
}));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('./deployment', () => ({
  deploymentStatus: () => ({ production: true, configured: true, policy: 'deployment' }),
  configurationHint: () => 'Not configured.',
}));
vi.mock('@guide/database', () => ({
  createIdentity: () => ({ api: { getSession: async () => h.session } }),
  createApplicationStore: () => ({ defaultLoginAccount: async () => h.defaultAccount }),
}));
import { requireSession } from './application';

const session = (id: string, mustChangePassword: boolean) => ({
  user: { id, emailVerified: true, active: true, mustChangePassword },
  session: { id: `${id}-session` },
});
const request = new Request('https://guides.example.org/api/studio/session');
beforeEach(() => {
  process.env.GUIDE_DATABASE_URL = 'postgresql://guide_runtime:x@postgres:5432/guide_app';
  process.env.BETTER_AUTH_SECRET = 's'.repeat(48);
  process.env.BETTER_AUTH_URL = 'https://guides.example.org';
  h.defaultAccount = null;
});

it('sends the default login to Finish setting up and nowhere else', async () => {
  h.session = session('default', true);
  h.defaultAccount = 'default';
  await expect(requireSession(request)).rejects.toMatchObject({
    code: 'SETUP_REQUIRED',
    status: 403,
  });
});

it('still asks an invited account to replace its password', async () => {
  h.session = session('invited', true);
  h.defaultAccount = 'default';
  await expect(requireSession(request)).rejects.toMatchObject({
    code: 'PASSWORD_CHANGE_REQUIRED',
    status: 403,
  });
});

it('lets a finished account through', async () => {
  h.session = session('owner', false);
  expect((await requireSession(request)).actor).toEqual({
    kind: 'user',
    id: 'owner',
    active: true,
  });
});
