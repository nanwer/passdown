import { randomUUID } from 'node:crypto';
import { ApplicationError } from '@guide/contracts';
import { mutationContext } from '../../../../../lib/application';
import { apiResponse, assertIdentifier } from '../../../../../lib/http';
import { maxUploadBytes, storeUpload } from '../../../../../lib/media';
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
  return apiResponse(async () => {
    const { store, actor } = await mutationContext(request);
    const { workspace } = await context.params;
    assertIdentifier(workspace);

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
    await store.createAsset(actor, workspace, { id, ...stored });
    return Response.json(
      { asset: { id, width: stored.width, height: stored.height } },
      { status: 201 },
    );
  });
}
