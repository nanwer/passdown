import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { commitRevisions } from './commit-revisions.mjs';

let messages;
if (process.argv[2] === '--event') {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) throw new Error('A repository event is required.');
  const event = JSON.parse(readFileSync(eventPath, 'utf8'));
  if (event.deleted) process.exit(0);
  const range = event.pull_request
    ? commitRevisions(event.pull_request.base.sha, event.pull_request.head.sha, {
        requireBefore: true,
      })
    : commitRevisions(event.before, event.after);
  messages = range.map((sha) => ({
    id: sha.slice(0, 12),
    raw: execFileSync('git', ['show', '-s', '--format=%B', sha], { encoding: 'utf8' }),
  }));
} else {
  messages = [
    {
      id: 'commit',
      raw: process.argv[2]
        ? readFileSync(process.argv[2], 'utf8')
        : execFileSync('git', ['log', '-1', '--format=%B'], { encoding: 'utf8' }),
    },
  ];
}
for (const { id, raw } of messages) {
  const message = raw
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
  const [subject, ...lines] = message.split('\n');
  const body = lines.join('\n');
  const sections = ['Why', 'Changes', 'Validation'];
  const failures = [];
  if (!subject || subject.length < 12 || subject.length > 100)
    failures.push('Use a specific subject between 12 and 100 characters.');
  for (const section of sections) {
    const match = body.match(
      new RegExp(`(?:^|\\n)${section}:\\s*([\\s\\S]*?)(?=\\n(?:Why|Changes|Validation):|$)`),
    );
    if (!match || match[1].trim().length < 15)
      failures.push(`Add a meaningful ${section}: explanation (at least 15 characters).`);
  }
  if (failures.length) {
    console.error(
      `${id}: commit explanation needs attention:\n` +
        failures.map((item) => `- ${item}`).join('\n'),
    );
    console.error('Use .gitmessage or see CONTRIBUTING.md for an example.');
    process.exitCode = 1;
  }
}
