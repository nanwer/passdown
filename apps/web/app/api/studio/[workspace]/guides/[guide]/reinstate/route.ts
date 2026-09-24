import { reinstateGuideSchema } from '@guide/contracts';
import {
  mutationContext,
  requireSession,
  getApplication,
} from '../../../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; guide: string }> };
export function POST(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace, guide } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(guide);
    const input = parseInput(reinstateGuideSchema, await readJSON(request));
    const result = await store.reinstateGuide(actor, workspace, guide, input);
    const root = await store.rootWorkspace();
    return Response.json({
      guide: result,
      url:
        root === workspace && result.audience === 'public'
          ? `/guides/${guide}`
          : `/w/${workspace}/guides/${guide}`,
    });
  });
}
export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    const { actor } = await requireSession(request);
    const { workspace, guide } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(guide);
    return Response.json({
      blockers: await getApplication().store.guideReinstateBlockers(actor, workspace, guide),
    });
  });
}
