/** Explicit, loopback-only example publisher. Uses ordinary authenticated application APIs. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readConfig, root } from './local-config.mjs';
import { prepareFormattingExample } from '../examples/formatting-catalog';
import { formattingExamples } from '../examples/formatting-guides';
import type { DraftGuide } from '../packages/contracts/src/index';

if (!process.argv.includes('--publish')) {
  console.log('Validated examples (no writes):');
  for (const example of formattingExamples) console.log(`- ${example.document.title}`);
  console.log(
    'Use --publish to create these examples in your local app. Existing examples are preserved.',
  );
  process.exit(0);
}
const config = readConfig();
const origin = config.BETTER_AUTH_URL;
if (origin !== 'http://127.0.0.1:3100')
  throw new Error('This publisher only supports the local application on 127.0.0.1:3100.');
const statePath = resolve(root, '.local-formatting-examples.json');
const state: Record<string, string> = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : {};
const health = await fetch(origin + '/api/health');
if (!health.ok || (await health.json()).mode !== 'persistent')
  throw new Error('The persistent local app must be running.');
const login = await fetch(origin + '/api/auth/sign-in/email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: origin },
  body: JSON.stringify({
    email: config.GUIDE_LOCAL_OWNER_EMAIL,
    password: config.GUIDE_LOCAL_OWNER_PASSWORD,
  }),
});
if (!login.ok)
  throw new Error(`Local sign-in failed (${login.status}). Credentials were not logged.`);
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
if (!cookie) throw new Error('The local sign-in did not return a session.');
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(origin + path, {
    method,
    headers: {
      Cookie: cookie,
      Origin: origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok)
    throw new Error(
      `Example request ${method} ${path} failed (${response.status}); existing guides were preserved.`,
    );
  return response.json();
}
const records: { title: string; url: string; editor: string; release: number }[] = [];
try {
  for (const example of formattingExamples) {
    let guide: DraftGuide;
    if (state[example.key]) {
      guide = (await api(`/api/studio/repair-collective/guides/${state[example.key]}`)).guide;
    } else {
      const prepared = await prepareFormattingExample(example.document, api);
      guide = (
        await api('/api/studio/repair-collective/guides', 'POST', {
          ...prepared,
          audience: 'public',
        })
      ).guide;
      state[example.key] = guide.id;
      writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
    }
    if (!guide.currentRelease) {
      if (guide.version !== 1 || guide.title !== example.document.title)
        throw new Error('An example draft has been edited. It was preserved without publishing.');
      await api(`/api/studio/repair-collective/guides/${guide.id}/publish`, 'POST', {
        expectedVersion: guide.version,
        expectedPublicationRevision: 0,
        expectedRelease: null,
        license: 'all-rights-reserved',
      });
    }
    records.push({
      title: guide.title,
      url: `${origin}/guides/${guide.id}`,
      editor: `${origin}/studio/repair-collective/${guide.id}`,
      release: guide.currentRelease ?? 1,
    });
  }
} finally {
  // End only this script's session; existing browser sessions remain signed in.
  await fetch(origin + '/api/auth/sign-out', {
    method: 'POST',
    headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
    body: '{}',
  });
}
const notes =
  '# Published formatting examples\n\nCreated at the user’s request in the persistent local app. These are real published releases, categorized as **Formatting examples**, with all rights reserved; no open-content license or external deployment is implied. Re-running the publisher preserves existing examples and user edits.\n\n' +
  records
    .map(
      (record) =>
        `- [${record.title}](${record.url}) · [Edit in Studio](${record.editor}) · published v${record.release}`,
    )
    .join('\n') +
  '\n\nThe showcase covers headings 1–6, bold, italic, underline, strike, inline code, combined marks, links, a soft line break, nested bullet/numbered lists, a quote, all six panel types, and rich tables with lists and panels inside cells. The practical guide shows those blocks in a realistic three-step layout.\n\nOpen any example, use the step navigation, toggle light/dark, and narrow the window. Wide tables scroll inside the reader. Editing controls appear only in Studio.\n';
writeFileSync(resolve(root, 'docs/development/published-formatting-examples.md'), notes);
for (const record of records) console.log(`${record.title}\n${record.url}\n${record.editor}`);
