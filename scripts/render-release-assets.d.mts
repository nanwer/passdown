export const registry: string;
export const releaseImages: string[];
export const releaseFiles: string[];
export type Digests = Record<string, string>;
export function renderCompose(text: string, options: { version: string; digests: Digests }): string;
export function composeProblems(text: string, options: { version: string }): string[];
export function renderReleaseAssets(options: {
  source: string;
  output: string;
  version: string;
  digests: Digests;
}): string[];
export function releaseAssetProblems(dir: string, options: { version: string }): string[];
