import 'server-only';
import { createDemoQueries } from '@guide/testing';
import type { Actor } from '@guide/core';
import type { Category } from '@guide/contracts';
import { getApplication, isConfigured, currentActor } from './application';
const queries = createDemoQueries();
export async function getPublicScope(workspaceId = 'repair-collective') {
  if (!isConfigured()) {
    const scope = queries.inWorkspace({ kind: 'anonymous' }, workspaceId);
    return scope ? { ...scope, categories: async (): Promise<Category[]> => [] } : null;
  }
  return getPersistentScope({ kind: 'anonymous' }, workspaceId);
}
async function getPersistentScope(actor: Actor, workspaceId: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(workspaceId)) return null;
  const { store } = getApplication();
  const workspace = await store.getWorkspace(actor, workspaceId);
  if (!workspace) return null;
  return {
    workspace,
    list: (filter?: { search?: string; category?: string; categoryId?: string }) =>
      store.listReleases(actor, workspaceId, filter),
    get: (id: string) => store.getRelease(actor, workspaceId, id),
    categories: () => store.listCategories(actor, workspaceId, { domain: 'guide' }),
  };
}
export async function getMemberScope(workspaceId: string) {
  if (!isConfigured()) return null;
  return getPersistentScope(await currentActor(), workspaceId);
}
export function getTeamPreviewScope() {
  if (process.env.GUIDE_DEMO_PREVIEW !== '1') return null;
  // This identity is confined to original, synthetic fixtures. Never connect this path to a real repository.
  return queries.inWorkspace({ kind: 'user', id: 'demo-reader', active: true }, 'workshop');
}
