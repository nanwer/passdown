import { servedImageWidths, type ServedImageWidth } from '@guide/content';

export type MediaFileIdentity = { workspace: string; asset: string };
/** Metadata describes the canonical display file, never an on-demand rendition. */
export type MediaFileMetadata = MediaFileIdentity & { bytes: number; sha256: string };
export type MediaFileVariant = 'display' | `w${ServedImageWidth}`;

export class MediaFileNameError extends Error {
  constructor() {
    super('Invalid media file reference.');
    this.name = 'MediaFileNameError';
  }
}
const workspacePattern = /^[a-z0-9][a-z0-9-]{0,99}$/;
const assetPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const completeMatch = (pattern: RegExp, value: unknown): value is string =>
  typeof value === 'string' && pattern.exec(value)?.[0] === value;

/** Portable relative name shared by the web store and backup/archive readers. */
export function mediaFileName(
  workspace: string,
  asset: string,
  variant: MediaFileVariant = 'display',
): string {
  if (
    !completeMatch(workspacePattern, workspace) ||
    !completeMatch(assetPattern, asset) ||
    (variant !== 'display' && !servedImageWidths.some((width) => variant === `w${width}`))
  )
    throw new MediaFileNameError();
  return `${workspace}/${asset}.${variant}.webp`;
}

/** Strict archive-member parser: renditions and noncanonical paths are not displays. */
export function parseDisplayMediaFileName(name: string): MediaFileIdentity | null {
  if (typeof name !== 'string') return null;
  const parts = name.split('/');
  if (parts.length !== 2 || !parts[1]!.endsWith('.display.webp')) return null;
  const workspace = parts[0]!;
  const asset = parts[1]!.slice(0, -'.display.webp'.length);
  try {
    return mediaFileName(workspace, asset) === name ? { workspace, asset } : null;
  } catch {
    return null;
  }
}
