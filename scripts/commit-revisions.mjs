import { execFileSync, spawnSync } from 'node:child_process';

export function commitRevisions(before, after, { requireBefore = false } = {}) {
  if (!/^[a-f0-9]{40}$/.test(before) || !/^[a-f0-9]{40}$/.test(after))
    throw new Error('Invalid commit range.');
  const initial = /^0+$/.test(before);
  const exists =
    !initial &&
    spawnSync('git', ['cat-file', '-e', `${before}^{commit}`], { stdio: 'ignore' }).status === 0;
  if (requireBefore && !exists)
    throw new Error(
      'The comparison base is missing. Fetch full history before checking this range.',
    );
  // A new branch or rewritten history may not contain the old tip. Check every
  // reachable commit in that case; existing commit notes make retries harmless.
  const range = exists ? `${before}..${after}` : after;
  return execFileSync('git', ['rev-list', '--reverse', range], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
}
