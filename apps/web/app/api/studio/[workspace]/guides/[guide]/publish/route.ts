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
    // Where this release can now be read.
    //
    // A public release in the workspace this installation serves at its root
    // gets the root address; everything else lives under its workspace. This
    // used to compare the workspace against a name written in the source, so on
    // any other installation a public guide was handed the members-only path,
    // which answers 404 to the public it was just published for.
    const root = await store.rootWorkspace();
    return Response.json({
      guide: release,
      url:
        workspace === root && release.audience === 'public'
          ? `/guides/${guide}`
          : `/w/${workspace}/guides/${guide}`,
    });
  });
}
