import { randomUUID } from 'node:crypto';
import { ApplicationError, assetPageSize, maxLibraryPageSize } from '@guide/contracts';
import { mutationContext, requireSession, getApplication } from '../../../../../lib/application';
import { apiResponse, assertIdentifier } from '../../../../../lib/http';
import { discardStoredAsset, maxUploadBytes, storeUpload } from '../../../../../lib/media';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspace: string }> };

/**
 * Accepts one image and records it.
 *
 * The bytes are re-encoded before anything is written, so what lands on disk
 * is always an image this application produced rather than the file a visitor
 * sent. The row is created only once the bytes are safely stored, so a failed
 * upload never leaves a reference to something that is not there.
 */
export function POST(request: Request, context: Context) {
  return apiResponse({ route: '/api/studio/[workspace]/assets', method: 'POST' }, async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);

    // Before the body is read, let alone decoded and written. This used to run
    // after storeUpload, so a signed-in caller could put files in the media
    // directory of a workspace they do not manage — and of one that does not
    // exist — and get a 404 while the file stayed there.
    const workspaces = await store.listWorkspaces(actor);
    if (!workspaces.some((candidate) => candidate.id === workspace && candidate.role === 'manage'))
      throw new ApplicationError('NOT_FOUND', 'Record not found.', 404);

    // Cheap rejection of an oversized body before it is buffered. The check
    // below still stands: a declared length is a claim, not a fact.
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > maxUploadBytes + 1024 * 1024)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Images must be 20 MB or smaller. Export a smaller copy and try again.',
        422,
      );

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File))
      throw new ApplicationError('VALIDATION_ERROR', 'Choose an image to upload.', 422);
    if (file.size > maxUploadBytes)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'Images must be 20 MB or smaller. Export a smaller copy and try again.',
        422,
      );

    const id = randomUUID();
    const stored = await storeUpload(workspace, id, Buffer.from(await file.arrayBuffer()));
    try {
      await store.createAsset(actor, workspace, { id, ...stored });
    } catch (error) {
      // Authorization already passed, so this is a lost race or a database
      // fault rather than a refusal — either way the bytes have no owner.
      await discardStoredAsset(workspace, id);
      throw error;
    }
    return Response.json(
      { asset: { id, width: stored.width, height: stored.height } },
      { status: 201 },
    );
  });
}

/**
 * Pictures already in this workspace, so an author can use one again instead
 * of uploading the same photograph to a second step.
 */
export function GET(request: Request, context: Context) {
  return apiResponse({ route: '/api/studio/[workspace]/assets', method: 'GET' }, async () => {
    const { actor } = await requireSession(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);
    const params = new URL(request.url).searchParams;
    const bounded = (raw: string | null, fallback: number, max: number, name: string) => {
      if (!raw) return fallback;
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 0 || value > max)
        throw new ApplicationError(
          'INVALID_QUERY',
          `${name} must be a whole number between 0 and ${max}.`,
          422,
        );
      return value;
    };
    return Response.json(
      await getApplication().store.listAssets(actor, workspace, {
        limit: Math.max(
          bounded(params.get('limit'), assetPageSize, maxLibraryPageSize, 'limit'),
          1,
        ),
        offset: bounded(params.get('offset'), 0, 100000, 'offset'),
      }),
    );
  });
}
