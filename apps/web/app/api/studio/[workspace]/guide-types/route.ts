import { getApplication, requireSession } from '../../../../../lib/application';
import { apiResponse, assertIdentifier } from '../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string }> };

/**
 * The kinds of work this workspace offers, and whether it composes titles.
 *
 * Both come back together because the create form cannot draw itself without
 * knowing each: the picker needs the list, and the title box needs to know
 * whether it is going to fill itself in.
 */
export function GET(request: Request, context: Context) {
  return apiResponse({ route: '/api/studio/[workspace]/guide-types', method: 'GET' }, async () => {
    const { actor } = await requireSession(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);
    return Response.json(await getApplication().store.guideTypeSettings(actor, workspace));
  });
}
