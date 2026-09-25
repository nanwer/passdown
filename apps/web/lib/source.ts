import { buildInfo } from '@guide/contracts';

export const publicRepository = 'https://github.com/nanwer/passdown';
export function sourceCodeURL(
  env: Readonly<Record<string, string | undefined>> = process.env,
  revision: string | null = env.PASSDOWN_REVISION ?? null,
): string {
  // Only a real commit identifier, by the shared build-information rule.
  const commit = buildInfo({ PASSDOWN_REVISION: revision ?? undefined }).revision;
  const configured = env.PASSDOWN_SOURCE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch {
      /* Invalid overrides fall back to the build revision. */
    }
  }
  return commit ? `${publicRepository}/tree/${commit}` : publicRepository;
}
