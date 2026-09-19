import { describe, expect, it } from 'vitest';
import { can, createGuideQueries, type GuideIndexRecord, type Membership } from './index';
const publicWorkspace = { id: 'repair', name: 'Repair collective', audience: 'public' as const };
const privateWorkspace = { id: 'team', name: 'Workshop', audience: 'private' as const };
const anonymous = { kind: 'anonymous' as const };
const user = { kind: 'user' as const, id: 'alex', active: true };
const membership = {
  workspaceId: 'team',
  actorId: 'alex',
  role: 'reader' as const,
  active: true,
  grants: [],
};
const guide = {
  id: 'brakes',
  workspaceId: 'repair',
  audience: 'public' as const,
  state: 'published' as const,
};
const publicContext = { actor: anonymous, workspace: publicWorkspace, membership: null, guide };
const privateContext = {
  actor: user,
  workspace: privateWorkspace,
  membership,
  guide: { ...guide, workspaceId: 'team', audience: 'members' as const },
};
describe('centralized policy', () => {
  it('allows initialized anonymous and outsider reads of live public releases', () => {
    expect(can('readRelease', publicContext)).toBe(true);
    expect(can('readRelease', { ...publicContext, actor: user })).toBe(true);
  });
  it('allows an active reader in their own private workspace', () => {
    expect(can('readRelease', privateContext)).toBe(true);
  });
  it.each([
    ['missing actor', { ...publicContext, actor: undefined }],
    ['malformed actor', { ...publicContext, actor: { kind: 'user' } }],
    ['suspended actor', { ...publicContext, actor: { ...user, active: false } }],
    ['anonymous private reader', { ...privateContext, actor: anonymous }],
    [
      'cross-workspace membership',
      { ...privateContext, membership: { ...membership, workspaceId: 'elsewhere' } },
    ],
    [
      'other actor membership',
      { ...privateContext, membership: { ...membership, actorId: 'someone-else' } },
    ],
    ['revoked membership', { ...privateContext, membership: { ...membership, active: false } }],
    ['workspace/guide mismatch', { ...publicContext, guide: { ...guide, workspaceId: 'team' } }],
    [
      'private workspace ceiling',
      { ...publicContext, workspace: { ...publicWorkspace, audience: 'private' } },
    ],
    ['draft', { ...publicContext, guide: { ...guide, state: 'draft' } }],
    ['withdrawn release', { ...publicContext, guide: { ...guide, state: 'withdrawn' } }],
    [
      'redacted release',
      { ...privateContext, guide: { ...privateContext.guide, state: 'redacted' } },
    ],
  ])('denies %s', (_, context) => {
    expect(can('readRelease', context)).toBe(false);
  });
  it('does not grant draft access to a member reader', () => {
    expect(can('readDraft', privateContext)).toBe(false);
  });
  it('keeps author capabilities scoped to their workspace', () => {
    const author = { ...membership, role: 'author' as const };
    expect(can('editDraft', { ...privateContext, membership: author })).toBe(true);
    expect(
      can('editDraft', { ...privateContext, membership: { ...author, workspaceId: 'repair' } }),
    ).toBe(false);
    expect(can('publish', { ...privateContext, membership: author })).toBe(false);
    expect(
      can('publish', { ...privateContext, membership: { ...author, grants: ['publisher'] } }),
    ).toBe(true);
  });
  it('treats review permission as eligibility, never approval or self-review bypass', () => {
    expect(
      can('review', { ...privateContext, membership: { ...membership, grants: ['reviewer'] } }),
    ).toBe(true);
    expect(can('review', privateContext)).toBe(false);
  });
});
describe('runtime-authorized query scopes', () => {
  function fixture() {
    const members: Membership[] = [membership];
    const records: GuideIndexRecord[] = [
      { ...guide, title: 'Adjust a brake', category: 'Bicycles', summary: 'Public sample' },
      {
        ...guide,
        id: 'private-public-ws',
        audience: 'members',
        title: 'Internal note',
        category: 'Bicycles',
        summary: 'Secret',
      },
      {
        ...guide,
        id: 'unpublished',
        state: 'draft',
        title: 'Unfinished procedure',
        category: 'Bicycles',
        summary: 'Secret',
      },
      {
        ...guide,
        id: 'restricted',
        state: 'withdrawn',
        title: 'Old procedure',
        category: 'Bicycles',
        summary: 'Secret',
      },
      {
        ...guide,
        id: 'team-guide',
        workspaceId: 'team',
        audience: 'members',
        title: 'Set up the bench',
        category: 'Operations',
        summary: 'Team sample',
      },
    ];
    const queries = createGuideQueries({
      getWorkspace: (id: string) =>
        [publicWorkspace, privateWorkspace].find((w) => w.id === id) ?? null,
      getMembership: (actorId: string, workspaceId: string) =>
        members.find((m) => m.actorId === actorId && m.workspaceId === workspaceId) ?? null,
      listGuides: (workspaceId: string) => records.filter((g) => g.workspaceId === workspaceId),
    });
    return { queries, members, records };
  }
  it('filters inaccessible records before search and counts', () => {
    const { queries } = fixture();
    const scope = queries.inWorkspace(anonymous, 'repair')!;
    expect(scope.list().map((g) => g.id)).toEqual(['brakes']);
    expect(scope.list({ search: 'Secret' })).toEqual([]);
    expect(scope.get('unpublished')).toBeNull();
    expect(scope.get('team-guide')).toBeNull();
  });
  it('does not manufacture an anonymous private scope', () => {
    expect(fixture().queries.inWorkspace(anonymous, 'team')).toBeNull();
  });
  it('rechecks membership on an already constructed scope', () => {
    const { queries, members } = fixture();
    const scope = queries.inWorkspace(user, 'team')!;
    expect(scope.get('team-guide')?.id).toBe('team-guide');
    members[0] = { ...membership, active: false };
    expect(scope.list()).toEqual([]);
    expect(scope.get('team-guide')).toBeNull();
  });
  it('returned records cannot mutate the source or broaden later reads', () => {
    const { queries } = fixture();
    const scope = queries.inWorkspace(anonymous, 'repair')!;
    scope.get('brakes')!.title = 'tampered';
    expect(scope.get('brakes')!.title).toBe('Adjust a brake');
  });
  it('rechecks restriction on subsequent reads', () => {
    const { queries, records } = fixture();
    const scope = queries.inWorkspace(anonymous, 'repair')!;
    expect(scope.get('brakes')?.id).toBe('brakes');
    records[0] = { ...records[0]!, state: 'withdrawn' };
    expect(scope.get('brakes')).toBeNull();
  });
});
