import { guideAudienceSchema } from '@guide/contracts';
import {
  getApplication,
  mutationContext,
  requireSession,
} from '../../../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; guide: string }> };

/** What would stop this guide being public, so the choice can be explained. */
export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    const { actor } = await requireSession(request);
    const { workspace, guide } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(guide);
    return Response.json({
      blockers: await getApplication().store.guidePublicBlockers(actor, workspace, guide),
    });
  });
}

export function PUT(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace, guide } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(guide);
    const input = parseInput(guideAudienceSchema, await readJSON(request));
    return Response.json({
      guide: await store.setGuideAudience(
        actor,
        workspace,
        guide,
        input.audience,
        input.expectedRelease,
      ),
    });
  });
}
