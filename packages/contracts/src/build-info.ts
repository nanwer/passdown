/**
 * The Passdown version this source builds, and the source revision a build
 * reports. A release changes the version here and in every package.json
 * together; a test holds them equal.
 */
export const passdownVersion = '0.1.0-alpha.1';

const commit = /^[0-9a-f]{7,40}$/;
export function buildInfo(env: Record<string, string | undefined> = process.env) {
  const revision = env.PASSDOWN_REVISION ?? '';
  return { version: passdownVersion, revision: commit.test(revision) ? revision : null };
}
