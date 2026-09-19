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
/**
 * A section is a view over one workspace, not a separate workspace.
 * `public` is the projection an anonymous visitor would see, and stays that way
 * even for a signed-in member. `internal` is the members-only side and requires
 * an active membership.
 */
export type Section = 'public' | 'internal';
async function getPersistentScope(
  actor: Actor,
  workspaceId: string,
  audience?: 'public' | 'members',
) {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(workspaceId)) return null;
  const { store } = getApplication();
  const workspace = await store.getWorkspace(actor, workspaceId);
  if (!workspace) return null;
  return {
    workspace,
    list: (filter?: { search?: string; category?: string; categoryId?: string }) =>
      store.listReleases(actor, workspaceId, { ...filter, audience }),
    get: (id: string) => store.getRelease(actor, workspaceId, id),
    categories: () => store.listCategories(actor, workspaceId, { domain: 'guide' }),
  };
}
export async function getMemberScope(workspaceId: string) {
  if (!isConfigured()) return null;
  return getPersistentScope(await currentActor(), workspaceId);
}
/**
 * The members-only section of a workspace. Returns null for anyone without an
 * active membership, so a visitor or a signed-in nonmember cannot tell the
 * section exists.
 */
export async function getInternalScope(workspaceId: string) {
  if (!isConfigured()) return null;
  const actor = await currentActor();
  if (actor.kind !== 'user') return null;
  // Membership, not merely a readable workspace: a signed-in nonmember must not
  // learn that an internal section exists.
  const memberships = await getApplication().store.listWorkspaces(actor);
  if (!memberships.some((workspace) => workspace.id === workspaceId)) return null;
  return getPersistentScope(actor, workspaceId, 'members');
}
/**
 * Section links for a workspace, or undefined when the viewer is not a member.
 * Returning undefined is what keeps the internal section unadvertised: there is
 * no tab, no count and no placeholder for anyone who cannot open it.
 */
export async function getSections(
  workspaceId: string,
  active: Section,
): Promise<{ active: Section; publicHref: string; internalHref: string } | undefined> {
  if (!isConfigured()) return undefined;
  const actor = await currentActor();
  if (actor.kind !== 'user') return undefined;
  const memberships = await getApplication().store.listWorkspaces(actor);
  const membership = memberships.find((workspace) => workspace.id === workspaceId);
  // A private workspace has no public side, so there is nothing to switch
  // between and no switch is offered.
  if (!membership || membership.audience !== 'public') return undefined;
  return { active, publicHref: '/', internalHref: `/w/${workspaceId}` };
}
export function getTeamPreviewScope() {
  if (process.env.GUIDE_DEMO_PREVIEW !== '1') return null;
  // This identity is confined to original, synthetic fixtures. Never connect this path to a real repository.
  return queries.inWorkspace({ kind: 'user', id: 'demo-reader', active: true }, 'workshop');
}
