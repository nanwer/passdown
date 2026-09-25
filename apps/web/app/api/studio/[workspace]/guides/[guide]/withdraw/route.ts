import { withdrawGuideSchema } from '@guide/contracts';
import { mutationContext } from '../../../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; guide: string }> };
export function POST(request: Request, context: Context) {
  return apiResponse(
    { route: '/api/studio/[workspace]/guides/[guide]/withdraw', method: 'POST' },
    async () => {
      const { store, actor } = await mutationContext(request);
      const { workspace, guide } = await context.params;
      assertIdentifier(workspace);
      assertIdentifier(guide);
      const input = parseInput(withdrawGuideSchema, await readJSON(request));
      const result = await store.withdrawGuide(actor, workspace, guide, input);
      return Response.json({ guide: result });
    },
  );
}
