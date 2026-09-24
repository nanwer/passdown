import { adminAccountQuerySchema } from '@guide/contracts';
import { requireSession, getApplication } from '../../../../lib/application';
import { apiResponse, parseInput } from '../../../../lib/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return apiResponse(async () => {
    const { actor } = await requireSession(request);
    const params = new URL(request.url).searchParams;
    const query = parseInput(adminAccountQuerySchema, Object.fromEntries(params));
    return Response.json(await getApplication().store.listAccountsForAdministrator(actor, query));
  });
}
