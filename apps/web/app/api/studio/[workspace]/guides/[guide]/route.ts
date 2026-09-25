import { ApplicationError, saveDraftSchema } from '@guide/contracts';
import { getApplication, mutationContext, requireSession } from '../../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; guide: string }> };
export function GET(request: Request, context: Context) {
  return apiResponse(
    { route: '/api/studio/[workspace]/guides/[guide]', method: 'GET' },
    async () => {
      const { actor } = await requireSession(request);
      const { workspace, guide } = await context.params;
      assertIdentifier(workspace);
      assertIdentifier(guide);
      const draft = await getApplication().store.getDraft(actor, workspace, guide);
      if (!draft) throw new ApplicationError('NOT_FOUND', 'Guide not found.', 404);
      return Response.json({ guide: draft });
    },
  );
}
export function PUT(request: Request, context: Context) {
  return apiResponse(
    { route: '/api/studio/[workspace]/guides/[guide]', method: 'PUT' },
    async () => {
      const { store, actor } = await mutationContext(request);
      const { workspace, guide } = await context.params;
      assertIdentifier(workspace);
      assertIdentifier(guide);
      const input = parseInput(saveDraftSchema, await readJSON(request));
      return Response.json({ guide: await store.saveDraft(actor, workspace, guide, input) });
    },
  );
}
