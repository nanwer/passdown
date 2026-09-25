import 'server-only';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp, { type Metadata, type Sharp } from 'sharp';
import {
  ApplicationError,
  mediaFileName,
  MediaFileNameError,
  type MediaFileVariant,
} from '@guide/contracts';
import { servedImageWidths, type ServedImageWidth } from '@guide/content';

/**
 * Turning an upload into bytes this application is willing to serve.
 *
 * Nothing a visitor sends is stored as it arrived. Every accepted image is
 * decoded and re-encoded, which drops EXIF — including the location a phone
 * records by default — and means a file that merely claims to be an image
 * never reaches disk. Orientation is applied during that pass so the stored
 * bytes are upright and every later consumer agrees on which way is up.
 *
 * Storage sits outside the web root and keys are random, so possession of a
 * path grants nothing; every read is authorized against a live reference.
 */
export const acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedType = (typeof acceptedTypes)[number];

/** Bounds chosen so one upload cannot exhaust memory or disk on a small host. */
export const maxUploadBytes = 20 * 1024 * 1024;
export const maxPixels = 40_000_000;
/** Long edge of the image actually served to readers. */
export const displayEdge = 1600;

export type StoredAsset = {
  contentHash: string;
  mediaType: AcceptedType;
  byteSize: number;
  width: number;
  height: number;
};

function mediaRoot() {
  // Keep runtime paths relative when configured that way. fs resolves them
  // against cwd; resolving an unknown environment value here instead makes
  // Next's file tracer treat the whole application directory as media.
  return process.env.GUIDE_MEDIA_ROOT ?? '.media';
}

/**
 * Whether pictures can be stored and served. A production installation must
 * have its volume mounted; development creates the directory on first upload.
 */
export async function mediaStatus({ production }: { production: boolean }) {
  try {
    // The root is runtime data: without the marker, Next's file tracer copies
    // everything this path could name, the whole application, into the build.
    const root = mediaRoot();
    if (!(await stat(/* turbopackIgnore: true */ root)).isDirectory())
      return 'unavailable' as const;
    await access(/* turbopackIgnore: true */ root, constants.R_OK | constants.W_OK);
    return 'ok' as const;
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    return missing && !production ? ('ok' as const) : ('unavailable' as const);
  }
}

/**
 * Where an asset's bytes live. The workspace is part of the path so a stray
 * read cannot wander between tenants, and the id is random rather than derived
 * from the filename a visitor chose.
 */
function assetPath(workspaceId: string, assetId: string, variant: MediaFileVariant) {
  try {
    mediaFileName(workspaceId, assetId, variant);
    // Keep the suffix visible to Next's file tracer. An opaque helper result
    // makes runtime media reads look like arbitrary application source reads.
    return join(mediaRoot(), workspaceId, `${assetId}.${variant}.webp`);
  } catch (error) {
    if (error instanceof MediaFileNameError)
      throw new ApplicationError('VALIDATION_ERROR', 'Invalid asset reference.', 422);
    throw error;
  }
}

/**
 * Decodes, re-encodes and writes an upload, returning what the database should
 * record. Rejects anything that is not a still image of an accepted type, or
 * whose dimensions would make decoding expensive.
 */
export async function storeUpload(
  workspaceId: string,
  assetId: string,
  bytes: Buffer,
): Promise<StoredAsset> {
  if (bytes.byteLength === 0)
    throw new ApplicationError('VALIDATION_ERROR', 'That file is empty.', 422);
  if (bytes.byteLength > maxUploadBytes)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Images must be 20 MB or smaller. Export a smaller copy and try again.',
      422,
    );

  let image: Sharp;
  let metadata: Metadata;
  try {
    image = sharp(bytes, { limitInputPixels: maxPixels, animated: false });
    metadata = await image.metadata();
  } catch {
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'That file could not be read as an image. JPEG, PNG and WebP are supported.',
      422,
    );
  }
  const declared = `image/${metadata.format}`;
  if (!acceptedTypes.includes(declared as AcceptedType))
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'JPEG, PNG and WebP images are supported. Other formats, including camera raw and HEIC, are not yet.',
      422,
    );
  if (!metadata.width || !metadata.height)
    throw new ApplicationError('VALIDATION_ERROR', 'That image has no readable size.', 422);
  if (metadata.width * metadata.height > maxPixels)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'That image has too many pixels to process. Export a smaller copy and try again.',
      422,
    );

  // rotate() applies the EXIF orientation and the re-encode drops the rest of
  // the metadata, so nothing about where or when the photo was taken survives.
  const processed = await image
    .rotate()
    .resize({ width: displayEdge, height: displayEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const path = assetPath(workspaceId, assetId, 'display');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, processed.data, { mode: 0o600 });

  return {
    contentHash: createHash('sha256').update(processed.data).digest('hex'),
    mediaType: 'image/webp',
    byteSize: processed.data.byteLength,
    width: processed.info.width,
    height: processed.info.height,
  };
}

/**
 * Reads stored bytes at a requested width. Callers must authorize the asset
 * first.
 *
 * Narrower renderings are produced on demand and kept, rather than at upload.
 * That way a picture added before this existed is served small too, an upload
 * stays one decode rather than four, and a width nobody ever asks for is never
 * computed. The width must come from the allow-list, so the number of files a
 * caller can cause is bounded at one per size.
 */
/**
 * Removes an asset's stored renditions.
 *
 * Used when the bytes have been written but the row cannot be recorded, so a
 * refused upload does not leave files behind that nothing will ever reference
 * or clean up.
 */
export async function discardStoredAsset(workspaceId: string, assetId: string): Promise<void> {
  await Promise.all(
    (['display', ...servedImageWidths.map((w) => `w${w}` as const)] as const).map((variant) =>
      rm(assetPath(workspaceId, assetId, variant), { force: true }),
    ),
  );
}

export async function readStoredAsset(
  workspaceId: string,
  assetId: string,
  width?: ServedImageWidth,
): Promise<Buffer> {
  const missing = () => new ApplicationError('NOT_FOUND', 'Record not found.', 404);
  const full = async () => {
    try {
      return await readFile(assetPath(workspaceId, assetId, 'display'));
    } catch {
      throw missing();
    }
  };
  if (!width) return full();

  const path = assetPath(workspaceId, assetId, `w${width}`);
  try {
    return await readFile(path);
  } catch {
    // Not rendered yet. Fall through and make it.
  }

  const source = await full();
  const metadata = await sharp(source).metadata();
  // A picture already narrower than the request is its own smallest useful
  // rendering; enlarging it would cost bytes and add nothing.
  if (!metadata.width || metadata.width <= width) return source;
  const resized = await sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, resized, { mode: 0o600 });
  return resized;
}
