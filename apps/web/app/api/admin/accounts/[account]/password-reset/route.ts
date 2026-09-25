import { ApplicationError } from '@guide/contracts';
import { mutationContext, getApplication } from '../../../../../../lib/application';
import { apiResponse } from '../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ account: string }> };
function valid(account: string) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(account))
    throw new ApplicationError('NOT_FOUND', 'Account not found.', 404);
}
export function POST(request: Request, context: Context) {
  return apiResponse(
    { route: '/api/admin/accounts/[account]/password-reset', method: 'POST' },
    async () => {
      const { store, actor } = await mutationContext(request);
      const { account } = await context.params;
      valid(account);
      const result = await store.adminIssuePasswordReset(actor, account);
      return Response.json(
        {
          link: new URL(`/reset/${result.token}`, getApplication().origin).href,
          expiresAt: result.expiresAt,
        },
        { status: 201 },
      );
    },
  );
}
export function DELETE(request: Request, context: Context) {
  return apiResponse(
    { route: '/api/admin/accounts/[account]/password-reset', method: 'DELETE' },
    async () => {
      const { store, actor } = await mutationContext(request);
      const { account } = await context.params;
      valid(account);
      await store.adminCancelPasswordReset(actor, account);
      return Response.json({ cancelled: true });
    },
  );
}
