import { ApplicationError } from '@guide/contracts';
import { mutationContext } from '../../../../../../../lib/application';
import { apiResponse, assertIdentifier, readJSON } from '../../../../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; category: string }> };

/**
 * Sets or clears the picture shown for a thing.
 *
 * The picture is an asset that has already been uploaded and re-encoded
 * through the media route; this only records which one to show. Nothing about
 * who may see it is decided here — an asset is readable exactly as far as the
 * thing it belongs to is, and that rule lives in the database.
 */
export function PUT(request: Request, context: Context) {
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace, category } = await context.params;
    assertIdentifier(workspace);
    assertIdentifier(category);
    const body = (await readJSON(request)) as { assetId?: unknown };
    const assetId = body?.assetId ?? null;
    if (assetId !== null && (typeof assetId !== 'string' || !/^[0-9a-f-]{36}$/.test(assetId)))
      throw new ApplicationError('VALIDATION_ERROR', 'Choose a picture, or none.', 422);
    return Response.json({
      category: await store.setCategoryImage(actor, workspace, category, assetId),
    });
  });
}
