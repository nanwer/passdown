import 'server-only';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import sharp, { type Metadata, type Sharp } from 'sharp';
import { ApplicationError } from '@guide/contracts';

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
  // Deliberately outside the web root: nothing here is statically served.
  return resolve(process.env.GUIDE_MEDIA_ROOT ?? join(process.cwd(), '.media'));
}

/**
 * Where an asset's bytes live. The workspace is part of the path so a stray
 * read cannot wander between tenants, and the id is random rather than derived
 * from the filename a visitor chose.
 */
function assetPath(workspaceId: string, assetId: string, variant: 'display') {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(workspaceId) || !/^[0-9a-f-]{36}$/.test(assetId))
    throw new ApplicationError('VALIDATION_ERROR', 'Invalid asset reference.', 422);
  return join(mediaRoot(), workspaceId, `${assetId}.${variant}.webp`);
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

/** Reads stored bytes. Callers must authorize the asset first. */
export async function readStoredAsset(workspaceId: string, assetId: string): Promise<Buffer> {
  try {
    return await readFile(assetPath(workspaceId, assetId, 'display'));
  } catch {
    throw new ApplicationError('NOT_FOUND', 'Record not found.', 404);
  }
}
