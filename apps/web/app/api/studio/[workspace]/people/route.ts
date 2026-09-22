import { inviteSchema } from '@guide/contracts';
import { getApplication, mutationContext, requireSession } from '../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string }> };

export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    const { actor } = await requireSession(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);
    return Response.json(await getApplication().store.listPeople(actor, workspace));
  });
}

/**
 * Invite somebody, and return the link.
 *
 * The token comes back exactly once, in this response, because only its hash
 * is kept. That is why the screen shows it immediately and says so: there is
 * no second chance to read it, and no support path that can recover it.
 */
export function POST(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);
    const input = parseInput(inviteSchema, await readJSON(request));
    const invitation = await store.inviteToWorkspace(actor, workspace, input);
    return Response.json(
      {
        id: invitation.id,
        expiresAt: invitation.expiresAt,
        // Built here rather than in the database: the origin is a property of
        // how this installation is reached, not of the invitation.
        link: new URL(`/invite/${invitation.token}`, getApplication().origin).href,
      },
      { status: 201 },
    );
  });
}
