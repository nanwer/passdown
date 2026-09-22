import { workspaceRoleSchema } from '@guide/contracts';
import { mutationContext } from '../../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; member: string }> };

export function PATCH(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace, member } = await context.params;
    assertIdentifier(workspace);
    const body = (await readJSON(request)) as { role?: unknown };
    const role = parseInput(workspaceRoleSchema, body.role);
    await store.setMemberRole(actor, workspace, member, role);
    return Response.json({ role });
  });
}

export function DELETE(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace, member } = await context.params;
    assertIdentifier(workspace);
    await store.removeMember(actor, workspace, member);
    return Response.json({ removed: true });
  });
}
