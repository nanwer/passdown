import { currentActor, getApplication, isConfigured } from '../../../../../lib/application';
import { apiResponse, assertIdentifier } from '../../../../../lib/http';
import { readStoredAsset } from '../../../../../lib/media';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string; asset: string }> };

/**
 * Serves an image, authorizing every request.
 *
 * Access follows a live reference, not possession of the identifier: an
 * unreferenced asset, a withdrawn release or a members-only guide all answer
 * 404 rather than revealing that the record exists. Nothing under the media
 * root is statically served, so this is the only way bytes leave.
 */
export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    const { workspace, asset } = await context.params;
    assertIdentifier(workspace);
    const notFound = () =>
      Response.json(
        { error: { code: 'NOT_FOUND', message: 'Record not found.' } },
        { status: 404, headers: { 'Cache-Control': 'private, no-store' } },
      );
    if (!isConfigured() || !/^[0-9a-f-]{36}$/.test(asset)) return notFound();

    const actor = await currentActor(request.headers);
    if (!(await getApplication().store.assetReadable(actor, workspace, asset))) return notFound();

    const bytes = await readStoredAsset(workspace, asset);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(bytes.byteLength),
        // Re-authorized on every request, so nothing shared may cache it.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
