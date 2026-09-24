import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ withdraw: vi.fn(), reinstate: vi.fn() }));
vi.mock('./application', () => ({
  mutationContext: async () => ({
    actor: { kind: 'user', id: 'owner', active: true },
    store: {
      withdrawGuide: mocks.withdraw,
      reinstateGuide: mocks.reinstate,
      rootWorkspace: async () => 'public',
    },
  }),
}));
import { POST as withdraw } from '../app/api/studio/[workspace]/guides/[guide]/withdraw/route';
import { POST as reinstate } from '../app/api/studio/[workspace]/guides/[guide]/reinstate/route';
it.each([
  ['withdraw', withdraw, mocks.withdraw],
  ['reinstate', reinstate, mocks.reinstate],
] as const)('forwards the observed revision for %s', async (name, route, call) => {
  call.mockResolvedValue({ id: 'guide', audience: 'public', publicationRevision: 5 });
  const response = await route(
    new Request(`http://127.0.0.1/api/studio/public/guides/guide/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRelease: 1, expectedPublicationRevision: 4 }),
    }),
    { params: Promise.resolve({ workspace: 'public', guide: 'guide' }) },
  );
  expect(response.status).toBe(200);
  expect(call.mock.calls[0]?.[3]).toEqual({ expectedRelease: 1, expectedPublicationRevision: 4 });
});
