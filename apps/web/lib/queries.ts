import 'server-only';
import { createDemoQueries, type DemoGuide } from '@guide/testing';
import type { Actor } from '@guide/core';
import {
  libraryPageSize,
  maxLibraryPageSize,
  type Category,
  type CategoryCounts,
  type PublishedGuide,
} from '@guide/contracts';
import { getApplication, isConfigured, currentActor } from './application';
const queries = createDemoQueries();
export type LibraryFilter = {
  search?: string;
  category?: string;
  categoryId?: string;
  limit?: number;
  offset?: number;
};
export type LibraryPage = {
  guides: (DemoGuide | PublishedGuide)[];
  total: number;
  limit: number;
  offset: number;
};
/** Nothing matched, in the shape a reader page expects. */
export const emptyLibraryPage: LibraryPage = {
  guides: [],
  total: 0,
  limit: libraryPageSize,
  offset: 0,
};
/**
 * How far into a listing `?page=` asks us to start.
 *
 * Bounded on the way in. The parameter is visitor input, and an offset taken
 * from it unchecked would let any request ask the database to walk past an
 * arbitrary number of rows — the same unbounded read the page size exists to
 * prevent, arriving through the URL instead.
 */
const maxLibraryPages = 500;
export function libraryOffset(value: string | string[] | undefined, limit = libraryPageSize) {
  const requested = typeof value === 'string' ? Number.parseInt(value, 10) : 1;
  if (!Number.isFinite(requested) || requested <= 1) return 0;
  return (Math.min(requested, maxLibraryPages) - 1) * limit;
}
/** One page of a reader's library, for whichever scope is serving the request. */
export function readLibraryPage(
  scope: { list: (filter: LibraryFilter) => Promise<LibraryPage> },
  filter: LibraryFilter,
  page: string | string[] | undefined,
): Promise<LibraryPage> {
  return scope.list({ ...filter, limit: libraryPageSize, offset: libraryOffset(page) });
}
/**
 * The sample library behind the same bounded contract as the persistent one.
 *
 * The fixtures live in memory, so paging them buys nothing on its own. It keeps
 * the reader pages written against one shape, which is what stops an unbounded
 * listing reappearing through the path that happens to be cheap.
 */
function demoScope(scope: NonNullable<ReturnType<typeof queries.inWorkspace>>) {
  return {
    ...scope,
    list: async (filter: LibraryFilter = {}) => {
      const limit = Math.min(Math.max(filter.limit ?? libraryPageSize, 1), maxLibraryPageSize);
      const offset = Math.max(filter.offset ?? 0, 0);
      const matches: DemoGuide[] = scope.list({
        search: filter.search,
        category: filter.category,
      });
      return {
        guides: matches.slice(offset, offset + limit),
        total: matches.length,
        limit,
        offset,
      };
    },
    categories: async (): Promise<Category[]> => [],
    // The sample library has no taxonomy, so its tabs come from the names its
    // guides carry. Cheap here, and never reached against a database.
    categoryNames: async () => [...new Set(scope.list().map((guide) => guide.category))],
    categoryCounts: async (): Promise<CategoryCounts[]> => [],
  };
}
/**
 * The workspace this installation shows at its root.
 *
 * Null when it has none — an installation whose workspaces are all private has
 * no public front page, and that is a configuration rather than a fault. The
 * sample library keeps its own name because it is a fixture, not a deployment.
 */
export async function rootWorkspaceId(): Promise<string | null> {
  if (!isConfigured()) return 'repair-collective';
  return getApplication().store.rootWorkspace();
}

export async function getPublicScope(workspaceId?: string) {
  const id = workspaceId ?? (await rootWorkspaceId());
  if (!id) return null;
  if (!isConfigured()) {
    const scope = queries.inWorkspace({ kind: 'anonymous' }, id);
    return scope ? demoScope(scope) : null;
  }
  return getPersistentScope({ kind: 'anonymous' }, id);
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
    list: (filter?: LibraryFilter) =>
      store.listReleases(actor, workspaceId, { ...filter, audience }),
    get: (id: string) => store.getRelease(actor, workspaceId, id),
    categories: () => store.listCategories(actor, workspaceId, { domain: 'guide' }),
    // The taxonomy names the category tabs here, so nothing has to read the
    // guides to find out what the categories are called.
    categoryNames: async (): Promise<string[]> => [],
    // Browse totals from the database, in the same section this scope reads.
    categoryCounts: () => store.listLibraryCategoryCounts(actor, workspaceId, audience),
    // Through the reader's own scope, so a relative they cannot open is
    // absent rather than shown as something withheld.
    family: (guideId: string) => store.getGuideFamily(actor, workspaceId, guideId),
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
  const scope = queries.inWorkspace({ kind: 'user', id: 'demo-reader', active: true }, 'workshop');
  return scope ? demoScope(scope) : null;
}
