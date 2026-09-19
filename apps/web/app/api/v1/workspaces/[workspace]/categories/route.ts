import { ApplicationError } from '@guide/contracts';
import { getApplication, isConfigured } from '../../../../../../lib/application';
import { apiResponse, assertIdentifier } from '../../../../../../lib/http';
export const dynamic = 'force-dynamic';
export function GET(_request: Request, context: { params: Promise<{ workspace: string }> }) {
  return apiResponse(async () => {
    const { workspace } = await context.params;
    assertIdentifier(workspace);
    if (!isConfigured()) return Response.json({ categories: [] });
    const store = getApplication().store,
      actor = { kind: 'anonymous' } as const;
    if (!(await store.getWorkspace(actor, workspace)))
      throw new ApplicationError('NOT_FOUND', 'Workspace not found.', 404);
    return Response.json({
      categories: await store.listCategories(actor, workspace, { domain: 'guide' }),
    });
  });
}
