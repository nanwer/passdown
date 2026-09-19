import { publishSchema } from '@guide/contracts';
import { mutationContext } from '../../../../../../../lib/application';
import { apiResponse, assertIdentifier, parseInput, readJSON } from '../../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; guide: string }> };
export function POST(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace, guide } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(guide);
    const input = parseInput(publishSchema, await readJSON(request));
    const release = await store.publishDraft(actor, workspace, guide, input);
    return Response.json({
      guide: release,
      url:
        workspace === 'repair-collective' && release.audience === 'public'
          ? `/guides/${guide}`
          : `/w/${workspace}/guides/${guide}`,
    });
  });
}
