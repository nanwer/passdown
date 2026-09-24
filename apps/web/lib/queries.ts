import { sampleLibraryEnabled, previewIdentitiesEnabled } from './deployment';
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
/**
 * A category id for the sample library, which stores only a name on each guide.
 *
 * Without one, the sample library was the reason two routes existed for the
 * same thing: its chips could only be names, so they filtered through
 * `?category=`, while a real installation's chips could have linked to the
 * category's own page. Giving the fixtures ids collapses that.
 */
const demoCategoryId = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function demoScope(scope: NonNullable<ReturnType<typeof queries.inWorkspace>>) {
  const taxonomy = (): Category[] =>
    [...new Set(scope.list().map((guide) => guide.category))].map((name, index) => ({
      id: demoCategoryId(name),
      workspaceId: scope.workspace.id,
      code: '',
      name,
      domain: 'guide' as const,
      parentId: null,
      description: '',
      visibility: 'public' as const,
      archived: false,
      version: 1,
      sortOrder: index,
      imageAssetId: null,
      path: [{ id: demoCategoryId(name), name }],
    }));
  return {
    ...scope,
    list: async (filter: LibraryFilter = {}) => {
      const limit = Math.min(Math.max(filter.limit ?? libraryPageSize, 1), maxLibraryPageSize);
      const offset = Math.max(filter.offset ?? 0, 0);
      const named = filter.categoryId
        ? taxonomy().find((item) => item.id === filter.categoryId)?.name
        : undefined;
      const matches: DemoGuide[] = scope.list({
        search: filter.search,
        category: named ?? filter.category,
      });
      return {
        guides: matches.slice(offset, offset + limit),
        total: matches.length,
        limit,
        offset,
      };
    },
    categories: async (): Promise<Category[]> => taxonomy(),
    categoryCounts: async (): Promise<CategoryCounts[]> =>
      taxonomy().map((item) => {
        const held = scope.list({ category: item.name }).length;
        return {
          categoryId: item.id,
          direct: held,
          subtree: held,
          publishedDirect: held,
          publishedSubtree: held,
        };
      }),
  };
}

/**
 * Whether whoever is asking may edit this workspace's guides.
 *
 * Used to decide whether a reading page offers an Edit affordance. Answering
 * false for an anonymous visitor is the common case and costs one query; the
 * alternative is a reading page that advertises an editor nobody can open.
 */
export async function viewerManages(workspaceId: string): Promise<boolean> {
  if (!isConfigured()) return false;
  const actor = await currentActor();
  if (actor.kind !== 'user') return false;
  const workspaces = await getApplication().store.listWorkspaces(actor);
  return workspaces.some((w) => w.id === workspaceId && w.role === 'manage');
}

/**
 * The workspace this installation shows at its root.
 *
 * Null when it has none — an installation whose workspaces are all private has
 * no public front page, and that is a configuration rather than a fault. The
 * sample library keeps its own name because it is a fixture, not a deployment.
 */
/**
 * Whether there is a session behind this request.
 *
 * The header offered "Open studio" to everyone, including a visitor with no
 * account, because the condition it asked was whether the installation had a
 * database rather than whether anybody was signed in.
 */
export async function viewerSignedIn(): Promise<boolean> {
  if (!isConfigured()) return false;
  return (await currentActor()).kind === 'user';
}

export async function rootWorkspaceId(): Promise<string | null> {
  if (sampleLibraryEnabled()) return 'repair-collective';
  return getApplication().store.rootWorkspace();
}

export async function getPublicScope(workspaceId?: string) {
  const id = workspaceId ?? (await rootWorkspaceId());
  if (!id) return null;
  if (sampleLibraryEnabled()) {
    const scope = queries.inWorkspace({ kind: 'anonymous' }, id);
    return scope ? demoScope(scope) : null;
  }
  return getPersistentScope({ kind: 'anonymous' }, id);
}
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
    withdrawn: (id: string) => store.withdrawnNotice(actor, workspaceId, id),
    categories: () => store.listCategories(actor, workspaceId, { domain: 'guide' }),
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
 * Every library this visitor can read, in the order they should be offered.
 *
 * This replaces a switch between the public and members-only sections of one
 * workspace. That switch showed the wrong axis: on a real installation the
 * public workspace's internal section is usually empty, while a separate team
 * workspace — which the switch could not reach at all — is where the members-only
 * guides actually are.
 *
 * The public library is named for what it is rather than for the workspace
 * behind it. "Repair collective" is an operator's word for their own workspace
 * and means nothing to somebody who has just arrived.
 *
 * An empty members-only library is left out. A tab that leads to nothing is
 * worse than no tab, and one appears as soon as something is published there.
 *
 * Returns what the visitor can read, including the single-entry case. Whether
 * one library is worth drawing a tab strip for is the header's decision, not
 * this function's.
 */
export async function getLibraries(
  currentHref: string,
): Promise<{ href: string; label: string; current: boolean }[]> {
  if (!isConfigured()) return [];
  const root = await rootWorkspaceId();
  const actor = await currentActor();
  const libraries: { href: string; label: string; current: boolean }[] = [];
  if (root) libraries.push({ href: '/', label: 'Public guides', current: currentHref === '/' });
  if (actor.kind !== 'user') return libraries;

  const store = getApplication().store;
  for (const workspace of await store.listWorkspaces(actor)) {
    const href = `/w/${workspace.id}`;
    const scope = await getInternalScope(workspace.id);
    if (!scope) continue;
    // One row, because the question is "is there anything here", not "what".
    // The library being looked at stays in the list even when it is empty —
    // dropping it would take the current tab out from under the reader.
    const current = currentHref === href;
    const { total } = await scope.list({ limit: 1 });
    if (!total && !current) continue;
    libraries.push({
      href,
      // A member knows their own workspace by name; that is the point of it.
      label: workspace.id === root ? `${workspace.name} · members` : workspace.name,
      current,
    });
  }
  return libraries;
}

export function getTeamPreviewScope() {
  if (!previewIdentitiesEnabled()) return null;
  // This identity is confined to original, synthetic fixtures. Never connect this path to a real repository.
  const scope = queries.inWorkspace({ kind: 'user', id: 'demo-reader', active: true }, 'workshop');
  return scope ? demoScope(scope) : null;
}
