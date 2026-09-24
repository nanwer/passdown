export const publicRepository = 'https://github.com/nanwer/passdown';
const commit = /^[0-9a-f]{7,40}$/;
export function sourceCodeURL(
  env: NodeJS.ProcessEnv = process.env,
  revision: string | null = env.PASSDOWN_REVISION ?? null,
): string {
  const configured = env.PASSDOWN_SOURCE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
    } catch {
      /* Invalid overrides fall back to the build revision. */
    }
  }
  return revision && commit.test(revision)
    ? `${publicRepository}/tree/${revision}`
    : publicRepository;
}
