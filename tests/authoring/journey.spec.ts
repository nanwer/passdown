import { browserContextOptions } from '../support/browser';
import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { prepareFormattingExample } from '../../examples/formatting-catalog';
import { formattingExamples } from '../../examples/formatting-guides';
import AxeBuilder from '@axe-core/playwright';
import { readConfig } from '../../scripts/local-config.mjs';
const credentials = readConfig();
const origin = 'http://127.0.0.1:3101';
const headers = { Origin: origin };
const guideDocument = (title: string) => ({
  schemaVersion: 1,
  title,
  summary: 'A persisted authoring verification guide.',
  locale: 'en',
  difficulty: 'easy',
  durationMinutes: 10,
  tools: [],
  steps: [
    {
      id: randomUUID(),
      title: 'Record the starting state',
      body: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Write down the starting state.', marks: [] }],
        },
      ],
      media: [],
      callouts: [],
    },
  ],
});
async function login(request: APIRequestContext) {
  const response = await request.post('/api/auth/sign-in/email', {
    headers,
    data: {
      email: credentials.GUIDE_LOCAL_OWNER_EMAIL,
      password: credentials.GUIDE_LOCAL_OWNER_PASSWORD,
    },
  });
  expect(response.status()).toBe(200);
}
async function ensureCategory(
  request: APIRequestContext,
  workspace: string,
  name = 'Browser verification',
) {
  const list = await request.get(`/api/studio/${workspace}/categories`);
  expect(list.status()).toBe(200);
  const existing = (await list.json()).categories.find(
    (item: { name: string; domain: string; parentId: string | null }) =>
      item.name === name && item.domain === 'guide' && item.parentId === null,
  );
  if (existing) return existing.id as string;
  const created = await request.post(`/api/studio/${workspace}/categories`, {
    headers,
    data: {
      domain: 'guide',
      parentId: null,
      name,
      description: 'Authoring verification',
      visibility: workspace === 'workshop' ? 'members' : 'public',
      sortOrder: 0,
    },
  });
  expect(created.status()).toBe(201);
  return (await created.json()).category.id as string;
}
async function create(request: APIRequestContext, workspace: string, title: string) {
  const response = await request.post(`/api/studio/${workspace}/guides`, {
    headers,
    data: {
      document: guideDocument(title),
      categoryId: await ensureCategory(request, workspace),
      audience: workspace === 'workshop' ? 'members' : 'public',
    },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).guide;
}
test('@core real public create, step editing, save, reload, immutable publication, and live discovery', async ({
  page,
  context,
}) => {
  const title = `Public journey ${randomUUID().slice(0, 8)}`;
  const categoryName = `Browser verification ${randomUUID().slice(0, 8)}`;
  await page.goto('/studio');
  await expect(page).toHaveURL(/sign-in/);
  await page
    .getByRole('textbox', { name: 'Email', exact: true })
    .fill(credentials.GUIDE_LOCAL_OWNER_EMAIL!);
  await page.getByLabel('Password', { exact: true }).fill(credentials.GUIDE_LOCAL_OWNER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Where will you create?' })).toBeVisible();
  // The workspace card stopped being a single link when it gained shortcuts
  // into Things, Catalog and People — nothing can nest inside a link.
  await page.getByRole('link', { name: 'Repair collective', exact: true }).click();
  // The form loads its category list on mount, so prepare this run's fixture first.
  await ensureCategory(context.request, 'repair-collective', categoryName);
  await page.getByRole('link', { name: 'New guide', exact: true }).click();
  await page.getByRole('textbox', { name: 'Guide title', exact: true }).fill(title);
  await page
    .getByRole('textbox', { name: 'Summary', exact: true })
    .fill('A working public guide created from the browser.');
  await page.getByRole('button', { name: /What is this about/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: categoryName, exact: true }).click();
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  // A fresh development server compiles the editor route during this navigation.
  await page.waitForURL(/studio\/repair-collective\/[a-f0-9-]+$/, { timeout: 30000 });
  const editorURL = page.url();
  const id = editorURL.split('/').pop()!;
  await page
    .getByRole('textbox', { name: 'Step title', exact: true })
    .fill('Prepare the workspace');
  await page
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('Clear the table and arrange the tools.');
  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  await page.getByRole('textbox', { name: 'Step title', exact: true }).fill('Check the result');
  await page
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('Compare the result with the starting state.');
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByRole('button', { name: 'Move up', exact: true }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(
    page.getByText('Clear the table and arrange the tools.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveText(
    'Clear the table and arrange the tools.',
  );
  await expect(page.locator('.studio-outline ol li')).toHaveCount(2);
  expect((await context.request.get(`/guides/${id}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Confirm publication', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Content license').selectOption('CC-BY-4.0');
  await page.getByRole('button', { name: 'Confirm publication', exact: true }).click();
  await page.getByRole('link', { name: 'Read published guide', exact: true }).click();
  await expect(page).toHaveTitle(new RegExp(title));
  await expect(page.getByText('Published · v1', { exact: true })).toBeVisible();
  await expect(page.getByText('CC-BY-4.0', { exact: true })).toBeVisible();
  await page.goto(editorURL);
  await page
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('This is the next, unpublished draft.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  const reader = await context.newPage();
  await reader.goto(`/guides/${id}`);
  await expect(
    reader.getByText('Clear the table and arrange the tools.', { exact: true }),
  ).toBeVisible();
  await expect(
    reader.getByText('This is the next, unpublished draft.', { exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  await page.getByLabel('Content license').selectOption('CC-BY-4.0');
  await page.getByRole('button', { name: 'Confirm publication', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Read published guide', exact: true })).toBeVisible();
  await reader.reload();
  await expect(reader.getByText('Published · v2', { exact: true })).toBeVisible();
  await expect(
    reader.getByText('This is the next, unpublished draft.', { exact: true }),
  ).toBeVisible();
  await reader.goto('/');
  await reader.getByRole('searchbox').fill(title);
  await expect(reader.locator('.guide-card')).toHaveCount(1);
  await expect(
    reader
      .getByRole('link')
      .filter({ has: reader.getByRole('heading', { name: title, exact: true }) }),
  ).toBeVisible();
});
test('@core real private release remains concealed from anonymous and public scopes', async ({
  page,
  request,
  browser,
}) => {
  await login(request);
  const title = `Private journey ${randomUUID().slice(0, 8)}`;
  const guide = await create(request, 'workshop', title);
  const publish = await request.post(`/api/studio/workshop/guides/${guide.id}/publish`, {
    headers,
    data: { expectedVersion: 1, expectedRelease: null, license: 'all-rights-reserved' },
  });
  expect(publish.status()).toBe(200);
  await login(page.request);
  await page.goto(`/w/workshop/guides/${guide.id}`);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page).toHaveTitle(new RegExp(title));
  const anonymous = await browser.newContext(browserContextOptions);
  for (const path of [
    `/w/workshop/guides/${guide.id}`,
    `/guides/${guide.id}`,
    `/preview/workshop/guides/${guide.id}`,
  ]) {
    const response = await anonymous.request.get(origin + path);
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain(title);
  }
  const search = await anonymous.request.get(
    `${origin}/api/v1/workspaces/repair-collective/guides?q=${encodeURIComponent(title)}`,
  );
  expect((await search.json()).total).toBe(0);
  expect(
    (await anonymous.request.get(origin + '/api/v1/workspaces/workshop/guides')).status(),
  ).toBe(404);
  await anonymous.close();
});
test('@api stale save and stale publication preserve the winning draft', async ({ request }) => {
  await login(request);
  const guide = await create(request, 'repair-collective', `Conflict ${randomUUID().slice(0, 8)}`);
  const path = `/api/studio/repair-collective/guides/${guide.id}`;
  const updated = { ...guide.document, title: 'Winning version ' + guide.id };
  const save = await request.put(path, {
    headers,
    data: { expectedVersion: 1, document: updated, categoryId: guide.categoryId },
  });
  expect(save.status()).toBe(200);
  expect(
    (
      await request.put(path, {
        headers,
        data: { expectedVersion: 1, document: guide.document, categoryId: guide.categoryId },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post(path + '/publish', {
        headers,
        data: { expectedVersion: 1, expectedRelease: null, license: 'CC-BY-4.0' },
      })
    ).status(),
  ).toBe(409);
  expect((await (await request.get(path)).json()).guide.document.title).toBe(updated.title);
  expect((await request.get(`/guides/${guide.id}`)).status()).toBe(404);
});
test('@api real HTTP boundaries reject forgery, excessive payloads, private identifiers and open registration', async ({
  request,
  playwright,
}) => {
  const anonymous = await playwright.request.newContext();
  const publicList = await anonymous.get(origin + '/api/v1/workspaces/repair-collective/guides');
  expect(publicList.status()).toBe(200);
  expect(publicList.headers()['cache-control']).toContain('no-store');
  expect(publicList.headers()['x-request-id']).toBeTruthy();
  expect((await anonymous.get(origin + '/api/studio/session')).status()).toBe(401);
  expect(
    (await anonymous.post(origin + '/api/auth/sign-up/email', { headers, data: {} })).status(),
  ).toBe(404);
  expect(
    (await anonymous.get(origin + '/api/v1/workspaces/Repair-collective/guides')).status(),
  ).toBe(404);
  expect(
    (
      await anonymous.get(
        origin + '/api/v1/workspaces/repair-collective/guides?q=' + 'x'.repeat(201),
      )
    ).status(),
  ).toBe(422);
  await login(request);
  const path = '/api/studio/repair-collective/guides';
  const data = {
    document: guideDocument('Security test'),
    categoryId: await ensureCategory(request, 'repair-collective', 'Testing'),
    audience: 'public',
  };
  expect((await request.post(path, { data })).status()).toBe(403);
  expect(
    (await request.post(path, { headers: { Origin: 'https://evil.test' }, data })).status(),
  ).toBe(403);
  expect(
    (await request.post(path, { headers, data: { ...data, actor: { id: 'other' } } })).status(),
  ).toBe(422);
  expect(
    (
      await request.post(path, {
        headers: { ...headers, 'Content-Type': 'text/plain' },
        data: '{}',
      })
    ).status(),
  ).toBe(415);
  expect(
    (
      await request.post(path, {
        headers: { ...headers, 'Content-Type': 'application/json' },
        data: '"' + 'x'.repeat(1024 * 1024) + '"',
      })
    ).status(),
  ).toBe(413);
  const logout = await request.post('/api/auth/sign-out', { headers, data: {} });
  expect(logout.status()).toBe(200);
  expect((await request.get('/api/studio/session')).status()).toBe(401);
  await anonymous.dispose();
});
test('@core two real editor tabs show a save conflict without losing either author’s text', async ({
  page,
  context,
}) => {
  await login(page.request);
  const guide = await create(
    page.request,
    'repair-collective',
    `Two tabs ${randomUUID().slice(0, 8)}`,
  );
  const path = `/studio/repair-collective/${guide.id}`;
  await page.goto(path);
  const second = await context.newPage();
  await second.goto(path);
  await expect(second.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveText(
    'Write down the starting state.',
  );
  await page
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('Saved from the first tab.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await second
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('Keep my second-tab changes.');
  await second.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(second.getByText('Save conflict', { exact: true })).toBeVisible();
  await expect(second.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveText(
    'Keep my second-tab changes.',
  );
  await second.getByText('Show recovery text', { exact: true }).click();
  await expect(
    second.getByRole('textbox', { name: 'Recovery draft JSON', exact: true }),
  ).toContainText('Keep my second-tab changes.');
  const stored = await (
    await page.request.get(`/api/studio/repair-collective/guides/${guide.id}`)
  ).json();
  expect(stored.guide.document.steps[0].body[0].document.content[0].content[0].text).toBe(
    'Saved from the first tab.',
  );
});
test('@api sign-in attempts are bounded and errors retain their request identifier', async ({
  request,
}) => {
  const email = `attempt-${randomUUID()}@test.local`;
  for (let index = 0; index < 10; index++) {
    const result = await request.post('/api/auth/sign-in/email', {
      headers,
      data: { email, password: 'A-deliberately-wrong-password' },
    });
    expect(result.status()).toBe(401);
    const body = await result.json();
    expect(body.error.requestId).toBe(result.headers()['x-request-id']);
  }
  const limited = await request.post('/api/auth/sign-in/email', {
    headers,
    data: { email, password: 'A-deliberately-wrong-password' },
  });
  expect(limited.status()).toBe(429);
  expect(limited.headers()['retry-after']).toBe('60');
});
test('@core persistent library and editor remain usable on a small screen in both themes', async ({
  page,
}) => {
  await login(page.request);
  const guide = await create(page.request, 'workshop', `Mobile ${randomUUID().slice(0, 8)}`);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/', '/w/workshop', `/studio/workshop/${guide.id}`]) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('A readable instruction at mobile size.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(
    page.getByText('A readable instruction at mobile size.', { exact: true }),
  ).toBeVisible();
});

test('visual rich text and panels inside tables persist and publish for both audiences', async ({
  page,
}) => {
  await login(page.request);
  for (const workspace of ['repair-collective', 'workshop']) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const guide = await create(
      page.request,
      workspace,
      `Visual authoring ${randomUUID().slice(0, 8)}`,
    );
    await page.goto(`/studio/${workspace}/${guide.id}`);
    const field = page.getByRole('textbox', { name: 'Instructions', exact: true });
    await field.fill('Preparation');
    await page.getByRole('button', { name: 'Text style', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Heading 2', exact: true }).click();
    await field.press('End');
    await field.press('Enter');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await page.keyboard.insertText('Use steady pressure.');
    await page.getByRole('button', { name: 'Bold', exact: true }).click();
    await field.press('Enter');
    await page.getByRole('button', { name: 'Insert elements', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Info panel', exact: true }).click();
    const outsidePanel = field.locator('[data-type="panel"]').first();
    await outsidePanel.locator('[data-node-view-content] p').first().click();
    await page.keyboard.insertText('Keep the original fasteners.');
    await page.getByRole('button', { name: 'Panel type', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Note', exact: true }).click();
    await page.getByRole('button', { name: 'Exit panel', exact: true }).click();
    await page.getByRole('button', { name: 'Insert elements', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Table', exact: true }).click();
    const table = field.locator('table');
    await table.locator('th').first().click();
    await page.keyboard.insertText('Part');
    await page.keyboard.press('Tab');
    await page.keyboard.insertText('Quantity');
    await page.keyboard.press('Tab');
    await page.keyboard.insertText('Check');
    await page.keyboard.press('Tab');
    await page.keyboard.insertText('Seal');
    await page.keyboard.press('Tab');
    await page.keyboard.insertText('1');
    await page.keyboard.press('Tab');
    await page.getByRole('button', { name: 'Insert elements', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Warning panel', exact: true }).click();
    const nestedPanel = table.locator('[data-type="panel"]');
    await nestedPanel.locator('[data-node-view-content] p').first().click();
    await page.keyboard.insertText('Replace if cracked.');
    await expect(field.locator('h2')).toHaveText('Preparation');
    await expect(field.locator('strong')).toHaveText('Use steady pressure.');
    await expect(nestedPanel).toHaveAttribute('data-tone', 'warning');
    await expect(field).not.toContainText('[!');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    await page.reload();
    await expect(field.locator('h2')).toHaveText('Preparation');
    await expect(table.locator('td [data-type="panel"]')).toContainText('Replace if cracked.');
    await expect(outsidePanel).toHaveAttribute('data-tone', 'note');
    await page
      .locator('.studio-editor-canvas')
      .screenshot({ path: test.info().outputPath(workspace + '-visual-editor.png') });
    const saved = await page.request.get(`/api/studio/${workspace}/guides/${guide.id}`);
    const document = (await saved.json()).guide.document;
    expect(document.schemaVersion).toBe(5);
    expect(document.steps[0].body[0].type).toBe('richText');
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Preparation', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Quantity', exact: true })).toBeVisible();
    await expect(page.locator('.studio-live-preview td .instruction-panel')).toContainText(
      'Replace if cracked.',
    );
    await page.getByRole('button', { name: 'Publish…', exact: true }).click();
    if (workspace === 'repair-collective')
      await page.getByLabel('Content license').selectOption('CC-BY-4.0');
    await page.getByRole('button', { name: 'Confirm publication', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(
      page.getByRole('link', { name: 'Read published guide', exact: true }),
    ).toBeFocused();
    await page.getByRole('link', { name: 'Read published guide', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Preparation', exact: true })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.locator('.reader-step p strong')).toHaveText('Use steady pressure.');
    await expect(page.locator('.reader-step td .instruction-panel')).toContainText(
      'Replace if cracked.',
    );
    await page
      .locator('.reader-step')
      .screenshot({ path: test.info().outputPath(workspace + '-visual-reader.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByText('Keep the original fasteners.', { exact: true })).toBeVisible();
  }
});

test('complete formatting examples publish with every supported style and readable mobile tables', async ({
  page,
}) => {
  await login(page.request);
  for (const example of formattingExamples) {
    const prepared = await prepareFormattingExample(
      example.document,
      async (path, method = 'GET', data) => {
        const response = await page.request.fetch(path, {
          method,
          headers,
          ...(data ? { data } : {}),
        });
        expect(response.ok()).toBeTruthy();
        return response.json();
      },
    );
    const created = await page.request.post('/api/studio/repair-collective/guides', {
      headers,
      data: { ...prepared, audience: 'public' },
    });
    expect(created.status()).toBe(201);
    const { guide } = await created.json();
    const published = await page.request.post(
      `/api/studio/repair-collective/guides/${guide.id}/publish`,
      {
        headers,
        data: { expectedVersion: 1, expectedRelease: null, license: 'all-rights-reserved' },
      },
    );
    expect(published.status()).toBe(200);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/guides/${guide.id}`);
    await expect(
      page.getByRole('heading', { name: example.document.title, exact: true }),
    ).toBeVisible();
    await expect(page.locator('.reader-step')).toHaveCount(example.document.steps.length);
    if (example.key === 'formatting-showcase-v1') {
      const first = page.locator('.reader-step').first();
      await expect(first.locator('strong').first()).toHaveText('bold for the action');
      await expect(first.locator('em').first()).toHaveText('italics for emphasis');
      await expect(first.locator('u').first()).toHaveText('underline for a key detail');
      await expect(first.locator('s')).toHaveText('miscellaneous parts');
      await expect(first.locator('code')).toHaveText('TRAY-A');
      await expect(first.locator('a')).toHaveAttribute('href', 'https://tiptap.dev/');
      await expect(first.locator('br')).toHaveCount(1);
      await expect(
        page
          .locator('.reader-step')
          .nth(1)
          .getByRole('heading', { name: /^Heading [1-6] — a section label$/ }),
      ).toHaveCount(6);
      const panels = page.locator('.reader-step').nth(3);
      for (const tone of ['info', 'note', 'success', 'warning', 'danger', 'decision']) {
        await expect(panels.locator(`.instruction-panel--${tone}`)).toHaveCount(1);
      }
      await expect(page.locator('.reader-step').nth(2).locator('ol li ul')).toHaveCount(1);
      await expect(page.locator('.reader-step').nth(2).locator('blockquote')).toHaveCount(1);
      await expect(page.locator('td .instruction-panel')).toHaveCount(3);
      await expect(page.locator('td ul')).toHaveCount(1);
      await panels.screenshot({ path: test.info().outputPath('published-example-panels.png') });
      await page
        .locator('.reader-step')
        .last()
        .screenshot({ path: test.info().outputPath('published-example-table.png') });
    }
    for (const theme of ['light', 'dark']) {
      if ((await page.locator('html').getAttribute('data-theme')) !== theme)
        await page.getByRole('button', { name: `Switch to ${theme} theme` }).click();
      // Heading-level demonstration intentionally exercises all authored levels; inspect WCAG rules.
      expect(
        (
          await new AxeBuilder({ page })
            .include('main')
            .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
            .analyze()
        ).violations,
      ).toEqual([]);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const scroller = page.locator('.instruction-table-scroll').first();
    await expect(scroller).toBeVisible();
    expect(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
      true,
    );
    await expect(
      page.locator('[data-table-insertion-controls], .rte-composer-toolbar'),
    ).toHaveCount(0);
  }
});

test('@api signing in correctly many times does not lock the account out', async ({ request }) => {
  // The per-address limit exists to bound credential guessing. Charging a
  // correct sign-in against it would lock out anyone who legitimately signs in
  // often, which is a real cost for no security gain.
  //
  // The same reasoning applies to the installation-wide counter, which used to
  // charge every attempt including the successful ones. At 60 a minute for
  // everybody at once, a shift starting or a class arriving would have locked
  // the whole workspace out — the application denying service to its own users
  // on their busiest morning. This loop is well past that old ceiling, so it
  // fails if the global counter ever goes back to counting successes.
  for (let attempt = 0; attempt < 75; attempt++) {
    const response = await request.post('/api/auth/sign-in/email', {
      headers,
      data: {
        email: credentials.GUIDE_LOCAL_OWNER_EMAIL,
        password: credentials.GUIDE_LOCAL_OWNER_PASSWORD,
      },
    });
    expect(response.status(), `attempt ${attempt + 1} of 75`).toBe(200);
  }
});

test('@api a correct sign-in clears earlier failed attempts', async ({ request }) => {
  const email = credentials.GUIDE_LOCAL_OWNER_EMAIL;
  for (let attempt = 0; attempt < 8; attempt++) {
    const failed = await request.post('/api/auth/sign-in/email', {
      headers,
      data: { email, password: 'A-deliberately-wrong-password' },
    });
    expect(failed.status()).toBe(401);
  }
  // Succeeding forgets those, so a later mistype does not inherit the count.
  expect(
    (
      await request.post('/api/auth/sign-in/email', {
        headers,
        data: { email, password: credentials.GUIDE_LOCAL_OWNER_PASSWORD },
      })
    ).status(),
  ).toBe(200);
  for (let attempt = 0; attempt < 8; attempt++) {
    const failed = await request.post('/api/auth/sign-in/email', {
      headers,
      data: { email, password: 'A-deliberately-wrong-password' },
    });
    expect(failed.status(), 'the counter should have been reset').toBe(401);
  }
});

test('a step number stays on one line beside a title that wraps', async ({ page }) => {
  // The outline breaks long titles anywhere so they cannot overflow, and the
  // number beside each one inherited that and could shrink, so "02" beside a
  // two-line title was drawn as a 0 above a 2.
  await login(page.request);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/studio/repair-collective/bicycle-brake');
  const items = page.locator('.studio-outline-item');
  await expect(items.first()).toBeVisible();
  const rows = await items.evaluateAll((buttons) =>
    buttons.map((button) => {
      const [number, title] = [button.querySelector('span')!, button.querySelector('strong')!];
      const lineHeight = parseFloat(getComputedStyle(number).lineHeight);
      return {
        number: number.textContent,
        numberHeight: number.getBoundingClientRect().height,
        lineHeight,
        titleLines: Math.round(
          title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight),
        ),
      };
    }),
  );
  // The seeded guide has titles long enough to wrap; without one this proves nothing.
  expect(rows.some((row) => row.titleLines > 1)).toBe(true);
  for (const row of rows) expect(row.numberHeight, row.number!).toBeLessThan(row.lineHeight * 1.5);
});

test('a focused step title keeps its focus border while the pointer is over it', async ({
  page,
}) => {
  // Hover and focus both colour the border. Focus has to win: somebody typing
  // with the pointer resting on the field still needs to see where they are.
  await login(page.request);
  await page.goto('/studio/repair-collective/bicycle-brake');
  const title = page.getByRole('textbox', { name: 'Step title', exact: true });
  await title.focus();
  await page.mouse.move(0, 0);
  const border = () => title.evaluate((element) => getComputedStyle(element).borderTopColor);
  const focused = await border();
  await title.hover();
  expect(await border()).toBe(focused);
  await page.getByRole('button', { name: 'Preview', exact: true }).hover();
  await page.getByRole('textbox', { name: 'Instructions', exact: true }).focus();
  // And a hovered field that is not focused still shows the hover border.
  await title.hover();
  expect(await border()).not.toBe(focused);
});
