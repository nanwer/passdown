import {
  actorSchema,
  can,
  isWorkspaceReadable,
  type Actor,
  type GuideAccess,
  type Membership,
  type Workspace,
} from './policy';
export type GuideIndexRecord = GuideAccess & {
  id: string;
  title: string;
  summary: string;
  category: string;
};
export type GuideSource<T extends GuideIndexRecord> = {
  getWorkspace(id: string): Workspace | null;
  getMembership(actorId: string, workspaceId: string): Membership | null;
  listGuides(workspaceId: string): readonly T[];
};
export type GuideFilter = { search?: string; category?: string };
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en');

/** Request-local scope construction stays private; neither a brand nor a caller-supplied workspace ID grants access. */
export function createGuideQueries<T extends GuideIndexRecord>(source: GuideSource<T>) {
  function inWorkspace(inputActor: unknown, workspaceId: string) {
    const result = actorSchema.safeParse(inputActor);
    if (!result.success) return null;
    const actor: Actor = result.data;
    function context() {
      const workspace = source.getWorkspace(workspaceId);
      const membership = actor.kind === 'user' ? source.getMembership(actor.id, workspaceId) : null;
      return workspace && isWorkspaceReadable(actor, workspace, membership)
        ? { actor, workspace, membership }
        : null;
    }
    const initial = context();
    if (!initial) return null;
    function list(filter: GuideFilter = {}): T[] {
      const current = context();
      if (!current) return [];
      const needle = normalize((filter.search ?? '').trim().slice(0, 200));
      return source
        .listGuides(workspaceId)
        .filter((guide) => can('readRelease', { ...current, guide }))
        .filter((guide) => !filter.category || guide.category === filter.category)
        .filter((guide) => !needle || normalize(`${guide.title} ${guide.summary}`).includes(needle))
        .map((guide) => structuredClone(guide));
    }
    return Object.freeze({
      workspace: Object.freeze({ ...initial.workspace }),
      list,
      get: (id: string): T | null => list().find((guide) => guide.id === id) ?? null,
    });
  }
  return Object.freeze({ inWorkspace });
}
