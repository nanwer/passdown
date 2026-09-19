import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { commitRevisions } from './commit-revisions.mjs';

// Run only for a trusted push to this repository's main branch. Commit text is
// sent as JSON, never interpolated into shell commands or executable scripts.
const { GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GH_TOKEN, GITHUB_EVENT_NAME } = process.env;
if (GITHUB_EVENT_NAME !== 'push' || !GITHUB_EVENT_PATH || !GH_TOKEN)
  throw new Error('This helper requires a push event and its repository token.');
const event = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'));
if (event.ref !== 'refs/heads/main' || event.deleted) process.exit(0);
if (
  event.repository?.full_name !== GITHUB_REPOSITORY ||
  !/^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPOSITORY ?? '')
)
  throw new Error('Repository scope does not match this push.');
const commits = commitRevisions(event.before, event.after);
const marker = '<!-- passdown-commit-note -->';
async function api(path, body) {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Commit note request failed (${response.status}).`);
  return response.json();
}
for (const sha of commits) {
  let exists = false;
  for (let page = 1; ; page++) {
    const comments = await api(`commits/${sha}/comments?per_page=100&page=${page}`);
    if (comments.some((comment) => comment.body.startsWith(marker))) {
      exists = true;
      break;
    }
    if (comments.length < 100) break;
  }
  if (exists) continue;
  const message = execFileSync('git', ['show', '-s', '--format=%B', sha], {
    encoding: 'utf8',
  }).trim();
  await api(`commits/${sha}/comments`, {
    body: `${marker}\n${message}\n\nValidation above records the author's checks. Hosted check results are shown separately on this commit.`,
  });
  console.log(`Added explanatory note for ${sha.slice(0, 12)}.`);
}
