import { mutationContext } from '../../../../../../lib/application';
import { apiResponse, assertIdentifier } from '../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; invitation: string }> };

/** Revoking a pending invitation makes its link stop working immediately. */
export function DELETE(request: Request, context: Context) {
  return apiResponse(
    { route: '/api/studio/[workspace]/invitations/[invitation]', method: 'DELETE' },
    async () => {
      const { store, actor } = await mutationContext(request);
      const { workspace, invitation } = await context.params;
      assertIdentifier(workspace);
      await store.revokeInvitation(actor, workspace, invitation);
      return Response.json({ revoked: true });
    },
  );
}
