import { z } from 'zod';
export const actorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('anonymous') }),
  z.strictObject({ kind: z.literal('user'), id: z.string().min(1), active: z.boolean() }),
]);
const membershipSchema = z.object({
  workspaceId: z.string().min(1),
  actorId: z.string().min(1),
  role: z.enum(['reader', 'contributor', 'author', 'admin', 'owner']),
  active: z.boolean(),
  grants: z.array(z.enum(['reviewer', 'publisher', 'moderator'])),
});
const workspaceSchema = z.object({
  id: z.string().min(1),
  audience: z.enum(['public', 'private']),
});
const guideSchema = z.object({
  workspaceId: z.string().min(1),
  audience: z.enum(['public', 'members']),
  state: z.enum(['draft', 'published', 'withdrawn', 'redacted']),
});
const contextSchema = z.object({
  actor: actorSchema,
  workspace: workspaceSchema,
  membership: membershipSchema.nullable(),
  guide: guideSchema,
});
export type Actor = z.infer<typeof actorSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type Workspace = z.infer<typeof workspaceSchema> & { name: string };
export type Action = 'readRelease' | 'readDraft' | 'editDraft' | 'review' | 'publish' | 'moderate';
export type GuideAccess = z.infer<typeof guideSchema>;

/** Capability eligibility only. Publication/review use cases must additionally enforce exact revision and review policy. */
export function can(action: Action, input: unknown): boolean {
  const result = contextSchema.safeParse(input);
  if (!result.success) return false;
  const { actor, workspace, membership, guide } = result.data;
  if (actor.kind === 'user' && !actor.active) return false;
  if (workspace.id !== guide.workspaceId || guide.state === 'redacted') return false;
  const member =
    actor.kind === 'user' &&
    membership?.active &&
    membership.actorId === actor.id &&
    membership.workspaceId === workspace.id
      ? membership
      : null;
  if (action === 'readRelease') {
    if (guide.state !== 'published') return false;
    return (workspace.audience === 'public' && guide.audience === 'public') || !!member;
  }
  if (!member) return false;
  const manages = member.role === 'owner' || member.role === 'admin';
  if (action === 'readDraft')
    return (
      manages ||
      member.role === 'author' ||
      member.grants.includes('reviewer') ||
      member.grants.includes('publisher')
    );
  if (action === 'editDraft') return manages || member.role === 'author';
  if (action === 'review') return manages || member.grants.includes('reviewer');
  if (action === 'publish') return manages || member.grants.includes('publisher');
  if (action === 'moderate') return manages || member.grants.includes('moderator');
  return false;
}
export function isWorkspaceReadable(
  actor: Actor,
  workspace: Workspace,
  membership: Membership | null,
): boolean {
  return can('readRelease', {
    actor,
    workspace,
    membership,
    guide: {
      workspaceId: workspace.id,
      audience: workspace.audience === 'public' ? 'public' : 'members',
      state: 'published',
    },
  });
}
