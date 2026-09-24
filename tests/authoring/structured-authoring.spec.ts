import { browserContextOptions, pressTab } from '../support/browser';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
import { readConfig } from '../../scripts/local-config.mjs';
import { toStructuredDocument } from '../../packages/guide-content/src/index';
import type { Category, CatalogItem, DraftGuide } from '@guide/contracts';
const credentials = readConfig();
const origin = 'http://127.0.0.1:3101';
const headers = { Origin: origin };
async function login(request: APIRequestContext) {
  expect(
    (
      await request.post('/api/auth/sign-in/email', {
        headers,
        data: {
          email: credentials.GUIDE_LOCAL_OWNER_EMAIL,
          password: credentials.GUIDE_LOCAL_OWNER_PASSWORD,
        },
      })
    ).status(),
  ).toBe(200);
}
async function api<T>(
  request: APIRequestContext,
  path: string,
  method = 'GET',
  data?: unknown,
): Promise<T> {
  const response = await request.fetch(path, { method, headers, ...(data ? { data } : {}) });
  expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
  return response.json();
}
async function category(
  request: APIRequestContext,
  workspace: string,
  name: string,
  domain: Category['domain'] = 'guide',
  parentId: string | null = null,
) {
  return (
    await api<{ category: Category }>(request, `/api/studio/${workspace}/categories`, 'POST', {
      domain,
      parentId,
      name,
      description: 'A category created for the complete authoring journey.',
      visibility: workspace === 'workshop' ? 'members' : 'public',
      sortOrder: 0,
    })
  ).category;
}
async function draft(
  request: APIRequestContext,
  workspace: string,
  categoryId: string,
  title: string,
  legacyTools: string[] = [],
) {
  const document = toStructuredDocument(
    {
      schemaVersion: 3,
      title,
      summary: 'A connected guide with exact requirements at each step.',
      locale: 'en',
      difficulty: 'easy',
      durationMinutes: 10,
      tools: legacyTools,
      steps: [1, 2].map((n) => ({
        id: randomUUID(),
        title: n === 1 ? 'Prepare the items' : 'Check the arrangement',
        body: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text:
                  n === 1
                    ? 'Arrange the items on a clean surface.'
                    : 'Confirm each group matches its label.',
                marks: [],
              },
            ],
          },
        ],
        media: [],
        callouts: [],
      })),
    },
    randomUUID,
  );
  return (
    await api<{ guide: DraftGuide }>(request, `/api/studio/${workspace}/guides`, 'POST', {
      document,
      categoryId,
      audience: workspace === 'workshop' ? 'members' : 'public',
    })
  ).guide;
}
async function publish(page: Page) {
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  if (await page.getByLabel('Content license').count())
    await page.getByLabel('Content license').selectOption('all-rights-reserved');
  await page.getByRole('button', { name: 'Confirm publication', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Read published guide', exact: true })).toBeVisible();
}
async function chooseCategory(page: Page, name: string, label = 'What is this about?') {
  // The label is a question, so escape it before it becomes a pattern —
  // an unescaped "?" is a quantifier and would match the wrong control.
  await page
    .getByRole('button', { name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) })
    .last()
    .click();
  await page.getByRole('dialog').last().getByRole('button', { name, exact: true }).click();
}
async function addCatalogItem(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add from catalog', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Search catalog' }).fill(name);
  await dialog.locator('.catalog-picker-results button').filter({ hasText: name }).click();
  await expect(dialog).toHaveCount(0);
}

for (const workspace of ['repair-collective', 'workshop']) {
  test(`${workspace}: five-level category creation, inline child selection, descendant browsing and safe moves`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(120000);
    await login(page.request);
    const suffix = randomUUID().slice(0, 7);
    const names = [
      `Equipment ${suffix}`,
      'Computers',
      'Laptops',
      'Example brand',
      `Model ${suffix}`,
    ];
    await page.goto(`/studio/${workspace}/categories`);
    await page.getByRole('button', { name: 'Add a thing', exact: true }).click();
    for (let level = 0; level < names.length; level++) {
      const dialog = page.getByRole('dialog').last();
      await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(names[level]!);
      await dialog.getByRole('button', { name: 'Add thing', exact: true }).click();
      // Each new thing appears in the table, opened up to and focused, and its
      // row offers the next level down.
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: names[level], exact: true })).toBeFocused();
      if (level < names.length - 1)
        await page
          .getByRole('button', { name: `Add a thing inside ${names[level]}`, exact: true })
          .click();
    }
    const tree = await api<{ categories: Category[] }>(
      page.request,
      `/api/studio/${workspace}/categories`,
    );
    const leaf = tree.categories.find((item) => item.name === names[4])!;
    const root = tree.categories.find((item) => item.name === names[0])!;
    expect(leaf.path.map((part) => part.name)).toEqual(names);
    await page.reload();
    // Four levels down is collapsed on arrival; a search opens the way to it and
    // shows what it passes through as context.
    await expect(page.getByRole('button', { name: names[4], exact: true })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search things' }).fill(names[4]!);
    await expect(page.getByRole('button', { name: names[4], exact: true })).toBeVisible();
    await expect(
      page.getByRole('row').filter({ hasText: 'Laptops' }).getByText('contains matches'),
    ).toBeVisible();
    const library = workspace === 'workshop' ? '/w/workshop' : '';
    const reader = await page.context().newPage();
    await reader.goto(`${library}/categories/${root.id}`);
    await expect(reader.getByRole('heading', { name: root.name, exact: true })).toBeVisible();
    await expect(reader.getByText('No published guides here yet', { exact: true })).toBeVisible();
    await expect(reader.getByRole('heading', { name: 'Computers', exact: true })).toBeVisible();
    await page.goto(`/studio/${workspace}/new`);
    const title = `Nested workflow ${suffix}`;
    await page.getByRole('textbox', { name: 'Guide title', exact: true }).fill(title);
    await page
      .getByRole('textbox', { name: 'Summary', exact: true })
      .fill('Unsaved details survive inline category creation.');
    await chooseCategory(page, leaf.name);
    await page.getByRole('button', { name: /What is this about/ }).click();
    await page.getByRole('button', { name: 'Add one inside this thing', exact: true }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill(`Procedures ${suffix}`);
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Add thing', exact: true })
      .click();
    await expect(page.getByRole('textbox', { name: 'Guide title', exact: true })).toHaveValue(
      title,
    );
    await expect(page.getByRole('button', { name: /What is this about/ })).toContainText(
      `Procedures ${suffix}`,
    );
    await page.getByRole('button', { name: 'Create draft', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/studio/${workspace}/[a-f0-9-]+$`));
    const guideId = page.url().split('/').pop()!;
    await page
      .getByRole('textbox', { name: 'Instructions', exact: true })
      .fill('Identify the model and choose the matching procedure.');
    await publish(page);
    await reader.reload();
    await expect(reader.locator('.guide-card')).toHaveCount(1);
    await expect(reader.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await reader.getByRole('searchbox').fill('no-match');
    await expect(reader.locator('.guide-card')).toHaveCount(0);
    await reader.getByRole('searchbox').fill(title);
    await expect(reader.locator('.guide-card')).toHaveCount(1);
    await reader.goto(`${library || '/'}?category=${encodeURIComponent(root.name)}`);
    await expect(reader.locator('.guide-card')).toHaveCount(1);
    await expect(reader.getByRole('link', { name: root.name, exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    await reader.goto(`${library}/guides/${guideId}`);
    await expect(
      reader.getByRole('navigation', { name: 'Where this guide is filed' }),
    ).toContainText(names[0]!);
    // Category assignments stay drafts until publication.
    await page.getByRole('button', { name: 'Guide details', exact: false }).click();
    await chooseCategory(page, root.name);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    await reader.reload();
    await expect(
      reader.getByRole('navigation', { name: 'Where this guide is filed' }),
    ).toContainText(`Procedures ${suffix}`);
    await page.goto(`/studio/${workspace}/categories`);
    await page.getByRole('button', { name: root.name, exact: true }).click();
    await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
    // What blocks retirement is explained before the attempt and the confirm
    // stays disabled, rather than a refusal arriving after a click.
    const confirm = page.getByRole('dialog', { name: 'Deactivate this thing' });
    await expect(confirm.locator('.structured-blockers')).toContainText(/Move|guide|inside/i);
    await expect(confirm.getByRole('button', { name: 'Deactivate', exact: true })).toBeDisabled();
    await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Search things' }).fill(leaf.name);
    await page.getByRole('button', { name: leaf.name, exact: true }).click();
    await page.getByRole('button', { name: 'Edit or move', exact: true }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill(`Renamed ${suffix}`);
    await chooseCategory(page, root.name, 'Sits inside');
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Save', exact: true })
      .click();
    // The edit closes; the thing's own sheet stays open, under its new name.
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByRole('dialog', { name: `Renamed ${suffix}` })).toBeVisible();
    await page.keyboard.press('Escape');
    await reader.reload();
    await expect(
      reader.getByRole('navigation', { name: 'Where this guide is filed' }),
    ).toContainText(`Renamed ${suffix}`);
    await expect(reader.getByRole('heading', { name: title, exact: true })).toBeVisible();
    if (workspace === 'workshop') {
      const anonymous = await browser.newContext(browserContextOptions);
      const response = await anonymous.request.get(origin + `/w/workshop/categories/${root.id}`);
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain(root.name);
      expect(
        (await anonymous.request.get(origin + '/api/v1/workspaces/workshop/categories')).status(),
      ).toBe(404);
      await anonymous.close();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
        .violations,
    ).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath(`${workspace}-categories-mobile.png`),
      fullPage: true,
    });
    await reader.close();
  });
}

test('catalog selection, step allocations, prerequisites and reviewed updates preserve published snapshots', async ({
  page,
}) => {
  test.setTimeout(150000);
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 7);
  const guideCategory = await category(page.request, workspace, `Catalog guides ${suffix}`);
  const toolName = `Phillips screwdriver ${suffix}`;
  await page.goto(`/studio/${workspace}/catalog`);
  await page.getByRole('button', { name: 'New catalog item', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Item name', exact: true })
    .fill(toolName);
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Specification / size', exact: true })
    .fill('Phillips #00');
  await page.getByRole('dialog').getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(page.getByRole('dialog', { name: toolName })).toContainText('Phillips #00');
  const tool = (
    await api<{ items: CatalogItem[] }>(page.request, `/api/studio/${workspace}/catalog`)
  ).items.find((item) => item.name === toolName)!;
  const partName = `Replacement screw ${suffix}`;
  await api<{ item: CatalogItem }>(page.request, `/api/studio/${workspace}/catalog`, 'POST', {
    name: partName,
    specification: 'M2 × 4 mm',
    description: 'New replacement screws.',
    manufacturer: '',
    model: '',
    partNumber: '',
    defaultUnit: 'each',
    visibility: 'public',
  });
  const guide = await draft(
    page.request,
    workspace,
    guideCategory.id,
    `Connected requirements ${suffix}`,
  );
  const editorURL = `/studio/${workspace}/${guide.id}`;
  await page.goto(editorURL);
  await page
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('Keep this unsaved instruction while selecting catalog items.');
  await addCatalogItem(page, toolName);
  await expect(page.getByRole('textbox', { name: 'Instructions', exact: true })).toContainText(
    'Keep this unsaved instruction',
  );
  await addCatalogItem(page, partName);
  await page
    .getByLabel(`${partName} in this step amount type`, { exact: true })
    .selectOption('fixed');
  await page.getByLabel(`${partName} in this step quantity`, { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Add precondition', exact: true }).click();
  await page
    .getByLabel('Precondition instruction', { exact: true })
    .fill('Clear and dry the work surface.');
  await page.getByLabel('Precondition emphasis', { exact: true }).selectOption('warning');
  await page
    .locator('.studio-outline')
    .getByRole('button', { name: /Check the arrangement/ })
    .click();
  await page
    .getByLabel('Choose preparation item for this step', { exact: true })
    .selectOption({ label: toolName + ' — Phillips #00' });
  await page.getByRole('button', { name: 'Assign to step', exact: true }).click();
  await page
    .getByLabel('Choose preparation item for this step', { exact: true })
    .selectOption({ label: partName + ' — M2 × 4 mm' });
  await page.getByRole('button', { name: 'Assign to step', exact: true }).click();
  await page
    .getByLabel(`${partName} in this step amount type`, { exact: true })
    .selectOption('fixed');
  await page.getByLabel(`${partName} in this step quantity`, { exact: true }).fill('3');
  await page.getByRole('checkbox', { name: 'Step 1: Prepare the items', exact: true }).check();
  await page.getByRole('button', { name: 'Move up', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Requirements to resolve before publishing' }),
  ).toContainText('can only depend on a step before it');
  await page.getByRole('button', { name: 'Move down', exact: true }).click();
  await page.getByRole('button', { name: 'Guide details', exact: false }).click();
  await page.getByLabel(`${toolName} amount type`, { exact: true }).selectOption('fixed');
  await page.getByLabel(`${toolName} quantity`, { exact: true }).fill('1');
  await page.getByLabel(`${partName} amount type`, { exact: true }).selectOption('fixed');
  await page.getByLabel(`${partName} quantity`, { exact: true }).fill('4');
  await expect(
    page.getByRole('region', { name: 'Requirements to resolve before publishing' }),
  ).toContainText('above the confirmed guide total');
  await page.getByLabel(`${partName} quantity`, { exact: true }).fill('5');
  await expect(
    page.getByRole('region', { name: 'Requirements to resolve before publishing' }),
  ).toHaveCount(0);
  await publish(page);
  const reader = await page.context().newPage();
  await reader.goto(`/guides/${guide.id}`);
  const preparation = reader.getByRole('region', { name: 'Guide preparation' });
  await expect(preparation.getByText(toolName, { exact: true })).toHaveCount(1);
  await expect(preparation).toContainText('1 each');
  await expect(preparation).toContainText('5 each');
  await expect(preparation.getByRole('link', { name: 'step 1', exact: true })).toHaveCount(2);
  await expect(
    reader
      .locator('.reader-step')
      .nth(1)
      .getByRole('link', { name: 'Complete step 1: Prepare the items' }),
  ).toBeVisible();
  await expect(reader.locator('.reader-step').first()).toContainText(
    'Clear and dry the work surface.',
  );
  const updatedFields = {
    name: tool.name,
    specification: 'Phillips #00 · updated grip',
    description: tool.description,
    manufacturer: tool.manufacturer,
    model: tool.model,
    partNumber: tool.partNumber,
    defaultUnit: tool.defaultUnit,
    visibility: tool.visibility,
    expectedVersion: tool.version,
    archived: false,
  };
  await api(page.request, `/api/studio/${workspace}/catalog/${tool.id}`, 'PATCH', updatedFields);
  await reader.reload();
  await expect(preparation).not.toContainText('updated grip');
  await page.reload();
  await page.getByRole('button', { name: 'Guide details', exact: false }).click();
  await page
    .getByRole('button', { name: 'Catalog update available · Review changes', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toContainText('Phillips #00 · updated grip');
  await page.getByRole('button', { name: 'Apply item details to draft', exact: true }).click();
  await expect(page.getByLabel(`${toolName} quantity`, { exact: true })).toHaveValue('1');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await reader.reload();
  await expect(preparation).not.toContainText('updated grip');
  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  await page.getByLabel('Content license').selectOption('all-rights-reserved');
  await page.getByRole('button', { name: 'Confirm publication', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await reader.reload();
  await expect(preparation).toContainText('updated grip');
  await reader.screenshot({
    path: test.info().outputPath('published-structured-requirements.png'),
    fullPage: true,
  });
  await reader.setViewportSize({ width: 390, height: 844 });
  expect(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  expect(
    (await new AxeBuilder({ page: reader }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await reader.close();
});

test('private legacy preparation links to an inline-created catalog item without losing unsaved work', async ({
  page,
  browser,
}) => {
  test.setTimeout(120000);
  await login(page.request);
  const workspace = 'workshop';
  const suffix = randomUUID().slice(0, 7);
  const root = await category(page.request, workspace, `Private procedures ${suffix}`);
  const legacy = `One reusable tray, keep each group separate ${suffix}`;
  const title = `Preserved preparation ${suffix}`;
  const guide = await draft(page.request, workspace, root.id, title, [legacy]);
  await page.goto(`/studio/${workspace}/${guide.id}`);
  await page.getByRole('button', { name: 'Guide details', exact: false }).click();
  await page.getByRole('textbox', { name: 'Guide title', exact: true }).fill(`${title} edited`);
  await expect(page.getByRole('button', { name: 'Publish…', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: `Link ${legacy}`, exact: true }).click();
  const itemName = `Sorting tray ${suffix}`;
  await page.getByRole('dialog').getByRole('textbox', { name: 'Search catalog' }).fill(itemName);
  await page.getByRole('button', { name: 'Create catalog item', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Item name', exact: true })).toHaveValue(itemName);
  await page
    .getByRole('textbox', { name: 'Specification / size', exact: true })
    .fill('Six compartments');
  await expect(
    page.getByRole('textbox', { name: 'Specification / size', exact: true }),
  ).toHaveValue('Six compartments');
  await page.getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Guide title', exact: true })).toHaveValue(
    `${title} edited`,
  );
  await expect(page.getByRole('heading', { name: 'Link existing preparation notes' })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole('textbox', { name: 'Guide-specific notes', exact: true }),
  ).toHaveValue(`Original preparation note: ${legacy}`);
  await page
    .locator('.studio-outline')
    .getByRole('button', { name: /Prepare the items/ })
    .click();
  await page
    .getByLabel('Choose preparation item for this step', { exact: true })
    .selectOption({ label: `${itemName} — Six compartments` });
  await page.getByRole('button', { name: 'Assign to step', exact: true }).click();
  await publish(page);
  await page.reload();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await expect(page.locator('.step-requirements')).toContainText(itemName);
  await page.screenshot({
    path: test.info().outputPath('structured-editor-desktop.png'),
    fullPage: true,
  });
  const reader = await page.context().newPage();
  await reader.goto(`/w/workshop/guides/${guide.id}`);
  await expect(reader.getByRole('region', { name: 'Guide preparation' })).toContainText(legacy);
  await expect(reader.locator('.reader-step').first()).toContainText(itemName);
  const anonymous = await browser.newContext(browserContextOptions);
  const denied = await anonymous.request.get(origin + `/w/workshop/guides/${guide.id}`);
  expect(denied.status()).toBe(404);
  expect(await denied.text()).not.toContain(itemName);
  await anonymous.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: test.info().outputPath('structured-editor-mobile.png'),
    fullPage: true,
  });
  await reader.close();
});

test('deactivation explains what still uses a category and only unblocks once those move', async ({
  page,
}) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const target = await category(page.request, workspace, `Retiring ${randomUUID().slice(0, 8)}`);
  const replacement = await category(
    page.request,
    workspace,
    `Replacement ${randomUUID().slice(0, 8)}`,
  );
  const guide = await draft(page.request, workspace, target.id, 'Assigned while archiving');

  await page.goto(`/studio/${workspace}/categories`);
  await page.getByRole('searchbox', { name: 'Search things' }).fill(target.name);
  const row = page.getByRole('button', { name: target.name, exact: true });
  await expect(row).toBeVisible();
  await row.click();

  // The code never changes and is what people quote to support, so the
  // record states it.
  expect(target.code).toMatch(/^GC-\d+$/);
  await expect(page.getByRole('dialog').getByText(target.code, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Deactivate this thing' });
  const blockers = confirm.locator('.structured-blockers');
  await expect(blockers).toBeVisible();
  await expect(blockers).toContainText('guide filed here');
  await expect(confirm.getByRole('button', { name: 'Deactivate', exact: true })).toBeDisabled();
  await confirm.getByRole('button', { name: 'Cancel', exact: true }).click();

  // Move the guide elsewhere, and the same category becomes retirable.
  const current = (
    await api<{ guide: DraftGuide }>(page.request, `/api/studio/${workspace}/guides/${guide.id}`)
  ).guide;
  await api(page.request, `/api/studio/${workspace}/guides/${guide.id}`, 'PUT', {
    expectedVersion: current.version,
    document: current.document,
    categoryId: replacement.id,
  });

  await page.reload();
  await page.getByRole('searchbox', { name: 'Search things' }).fill(target.name);
  await page.getByRole('button', { name: target.name, exact: true }).click();
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(confirm.getByRole('status')).toHaveCount(0);
  await expect(confirm.locator('.structured-blockers')).toHaveCount(0);
  await confirm.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByText(`${target.name} is inactive`, { exact: false })).toBeVisible();
});

test('catalog listing reports how many guides use each item and filters by status', async ({
  page,
}) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const unused = (
    await api<{ item: CatalogItem }>(page.request, `/api/studio/${workspace}/catalog`, 'POST', {
      name: `Unused driver ${randomUUID().slice(0, 8)}`,
      specification: 'Phillips #1',
      description: 'Never referenced by a guide.',
      manufacturer: '',
      model: '',
      partNumber: '',
      defaultUnit: 'each',
      visibility: 'public',
    })
  ).item;

  await page.goto(`/studio/${workspace}/catalog`);
  const tabs = page.getByRole('group', { name: 'Status' });
  await expect(tabs).toBeVisible();
  // The tabs are drawn while the list is still loading, counting nothing. Read
  // them only once it has arrived: reading during the load compared zeros,
  // which proves nothing, or caught the list arriving between two reads.
  await expect(page.getByText(/^\d+ items?$/)).toBeVisible();

  // All equals Active plus Inactive, and the counts respond to the filters.
  const readCount = async (name: string) =>
    Number(
      (await tabs.getByRole('button', { name: new RegExp(`^${name}`) }).innerText()).replace(
        /\D/g,
        '',
      ),
    );
  const [all, active, inactive] = [
    await readCount('All'),
    await readCount('Active'),
    await readCount('Inactive'),
  ];
  expect(active, 'the item created above is active').toBeGreaterThan(0);
  expect(all).toBe(active + inactive);

  // An item nothing references shows no usage. Searched for, because the table
  // pages and earlier scenarios leave plenty of other items behind.
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill(unused.name);
  const row = page.getByRole('row').filter({ hasText: unused.name });
  await expect(row).toHaveCount(1);
  const guides = await page
    .getByRole('columnheader')
    .evaluateAll((headers) =>
      headers.findIndex((header) => header.textContent?.includes('Guides')),
    );
  expect(guides).toBeGreaterThan(0);
  await expect(row.locator('th, td').nth(guides)).toHaveText('—');
});

test('libraries are tabs: a member switches between them, a visitor gets only the public one', async ({
  page,
  browser,
}) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const section = await category(page.request, workspace, `Sections ${randomUUID().slice(0, 8)}`);

  // A members-only guide inside the public workspace: the case the split exists for.
  const internalTitle = `Internal only ${randomUUID().slice(0, 8)}`;
  const internal = (
    await api<{ guide: DraftGuide }>(page.request, `/api/studio/${workspace}/guides`, 'POST', {
      document: toStructuredDocument(
        {
          schemaVersion: 3,
          title: internalTitle,
          summary: 'Visible to members of this workspace only.',
          locale: 'en',
          difficulty: 'easy',
          durationMinutes: 5,
          tools: [],
          steps: [
            {
              id: randomUUID(),
              title: 'Internal step',
              body: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Internal instruction.', marks: [] }],
                },
              ],
              media: [],
              callouts: [],
            },
          ],
        },
        randomUUID,
      ),
      categoryId: section.id,
      audience: 'members',
    })
  ).guide;
  await api(page.request, `/api/studio/${workspace}/guides/${internal.id}/publish`, 'POST', {
    expectedVersion: internal.version,
    expectedRelease: null,
    license: 'all-rights-reserved',
  });

  // A member gets a tab for every library they can read, and the public one
  // stays a public-only view.
  await page.goto('/');
  const libraries = page.getByRole('navigation', { name: 'Libraries' });
  await expect(libraries.getByRole('link', { name: 'Public guides' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText(internalTitle, { exact: false })).toHaveCount(0);

  // Named for the workspace, because that is what a member knows it by.
  const members = libraries.locator(`a[href="/w/${workspace}"]`);
  await expect(members).toContainText('Repair collective');
  await members.click();
  await expect(page).toHaveURL(new RegExp(`/w/${workspace}$`));
  await expect(page.getByText(internalTitle, { exact: false }).first()).toBeVisible();

  // A category has one address. `/?category=` was the other one, and it now
  // sends anything still pointing at it to the page that owns the subject.
  const moved = await page.request.get(`/?category=${section.id}`, { maxRedirects: 0 });
  expect(moved.status()).toBe(307);
  expect(moved.headers()['location']).toContain(`/categories/${section.id}`);

  // Three tabs on this installation, and a phone is where a header full of
  // labels has pushed the page sideways before.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(libraries.getByRole('link', { name: 'Public guides' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // A visitor gets one tab, and no hint that the other library exists.
  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto('/');
  const theirs = visitor.getByRole('navigation', { name: 'Libraries' });
  await expect(theirs.getByRole('link')).toHaveCount(1);
  await expect(theirs.locator(`a[href="/w/${workspace}"]`)).toHaveCount(0);
  await expect(visitor.getByText(internalTitle, { exact: false })).toHaveCount(0);
  expect((await visitor.request.get(`/w/${workspace}`)).status()).toBe(404);
  await anonymous.close();
});

test('creating a guide offers a section only where the workspace has both', async ({ page }) => {
  await login(page.request);

  // A public workspace holds both sections, so the choice is explicit.
  await page.goto('/studio/repair-collective/new');
  const choice = page.getByRole('group', { name: 'Section' });
  await expect(choice).toBeVisible();
  await expect(choice.getByRole('radio', { name: /Public/ })).toBeChecked();
  // fc309b4 replaced a claim that the choice was permanent, because it is not.
  await expect(choice.getByText('can move a guide between sections later')).toBeVisible();

  // A private workspace has no public side, so there is nothing to choose.
  await page.goto('/studio/workshop/new');
  await expect(page.getByRole('group', { name: 'Section' })).toHaveCount(0);
  await expect(page.getByText('only visible to active workspace members')).toBeVisible();
});

test('@core a picture is re-encoded, shown to readers of the guide, and hidden from everyone else', async ({
  page,
  browser,
}) => {
  const sharp = (await import('sharp')).default;
  await login(page.request);
  const workspace = 'repair-collective';
  const section = await category(page.request, workspace, `Pictures ${randomUUID().slice(0, 8)}`);

  // A JPEG carrying EXIF, including a location, and a sideways orientation.
  const original = await sharp({
    create: { width: 240, height: 120, channels: 3, background: '#2f6f5e' },
  })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Artist: 'Camera', Copyright: 'Somebody' } })
    .jpeg()
    .toBuffer();

  const uploaded = await page.request.post(`/api/studio/${workspace}/assets`, {
    headers,
    multipart: { file: { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: original } },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const assetId = (await uploaded.json()).asset.id as string;

  // Nothing references it yet, so even its owner's readers cannot fetch it.
  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  expect((await visitor.request.get(`/api/media/${workspace}/${assetId}`)).status()).toBe(404);

  // Put it on a step and publish.
  const guide = await draft(
    page.request,
    workspace,
    section.id,
    `Picture guide ${randomUUID().slice(0, 8)}`,
  );
  const withPicture = {
    ...guide.document,
    steps: guide.document.steps.map((step, index) =>
      index === 0
        ? { ...step, media: [{ assetId, alt: 'The finished workbench', annotations: [] }] }
        : step,
    ),
  };
  await api(page.request, `/api/studio/${workspace}/guides/${guide.id}`, 'PUT', {
    expectedVersion: guide.version,
    document: withPicture,
    categoryId: section.id,
  });
  await api(page.request, `/api/studio/${workspace}/guides/${guide.id}/publish`, 'POST', {
    expectedVersion: guide.version + 1,
    expectedRelease: null,
    license: 'all-rights-reserved',
  });

  // A reader of the published guide gets the picture, re-encoded and upright.
  const served = await visitor.request.get(`/api/media/${workspace}/${assetId}`);
  expect(served.status()).toBe(200);
  expect(served.headers()['content-type']).toBe('image/webp');
  const meta = await sharp(await served.body()).metadata();
  expect(meta.format).toBe('webp');
  // Orientation 6 means the stored bytes must come back rotated a quarter turn.
  expect(meta.width).toBe(120);
  expect(meta.height).toBe(240);
  // Nothing of the camera's metadata survives the re-encode.
  expect(meta.exif).toBeUndefined();

  // The picture appears in the reader with its description.
  await visitor.goto(`/guides/${guide.id}`);
  await expect(visitor.getByAltText('The finished workbench')).toBeVisible();
  await anonymous.close();

  // A document cannot claim an asset from another workspace.
  const otherSection = await category(
    page.request,
    'workshop',
    `Other ${randomUUID().slice(0, 8)}`,
  );
  const otherGuide = await draft(
    page.request,
    'workshop',
    otherSection.id,
    `Foreign ${randomUUID().slice(0, 8)}`,
  );
  const stealing = await page.request.put(`/api/studio/workshop/guides/${otherGuide.id}`, {
    headers,
    data: {
      expectedVersion: otherGuide.version,
      document: {
        ...otherGuide.document,
        steps: otherGuide.document.steps.map((step, index) =>
          index === 0 ? { ...step, media: [{ assetId, alt: 'Not mine', annotations: [] }] } : step,
        ),
      },
      categoryId: otherSection.id,
    },
  });
  expect(stealing.status(), 'an asset from another workspace must be refused').toBe(422);
});

test('a guide family lets readers narrow to a model without exposing relatives they cannot read', async ({
  page,
  browser,
}) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const section = await category(page.request, workspace, `Family ${randomUUID().slice(0, 8)}`);
  const suffix = randomUUID().slice(0, 8);

  const publish = async (id: string, version: number) =>
    api(page.request, `/api/studio/${workspace}/guides/${id}/publish`, 'POST', {
      expectedVersion: version,
      expectedRelease: null,
      license: 'all-rights-reserved',
    });

  const range = await draft(page.request, workspace, section.id, `Fridges ${suffix}`);
  const model = await draft(page.request, workspace, section.id, `Fridge model A ${suffix}`);
  await publish(range.id, range.version);
  await publish(model.id, model.version);

  const setParent = (child: string, parent: string | null) =>
    page.request.put(`/api/studio/${workspace}/guides/${child}/family`, {
      headers,
      data: { parentGuideId: parent, sortOrder: 0 },
    });

  expect((await setParent(model.id, range.id)).status()).toBe(200);

  // A guide cannot be its own ancestor, nor its own parent.
  expect((await setParent(range.id, model.id)).status()).toBeGreaterThanOrEqual(400);
  expect((await setParent(model.id, model.id)).status()).toBeGreaterThanOrEqual(400);

  // Nor can a family cross workspaces.
  const otherSection = await category(page.request, 'workshop', `Other ${suffix}`, 'guide');
  const otherGuide = await draft(page.request, 'workshop', otherSection.id, `Elsewhere ${suffix}`);
  expect(
    (
      await page.request.put(`/api/studio/workshop/guides/${otherGuide.id}/family`, {
        headers,
        data: { parentGuideId: range.id, sortOrder: 0 },
      })
    ).status(),
  ).toBeGreaterThanOrEqual(400);

  // The author's own control: set the link from the editor, not the API.
  await page.goto(`/studio/${workspace}/${model.id}`);
  await page.getByRole('button', { name: 'Guide details' }).click();
  const picker = page.getByLabel('Part of a broader guide');
  await expect(picker).toHaveValue(range.id);
  await picker.selectOption('');
  await expect(page.getByText('Saved. This guide stands on its own.')).toBeVisible();
  await picker.selectOption(range.id);
  await expect(page.getByText('This guide now sits beneath that one.')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Guide details' }).click();
  await expect(page.getByLabel('Part of a broader guide')).toHaveValue(range.id);

  // A reader on the range can narrow into the model, and back again.
  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto(`/guides/${range.id}`);
  await expect(visitor.getByRole('heading', { name: 'Choose your version' })).toBeVisible();
  await visitor.getByRole('link', { name: `Fridge model A ${suffix}` }).click();
  await expect(visitor).toHaveURL(new RegExp(model.id));
  await expect(
    visitor.getByRole('navigation', { name: 'Broader guides' }).getByRole('link', {
      name: `Fridges ${suffix}`,
    }),
  ).toBeVisible();

  // An internal parent stays invisible to a reader of its public child: no
  // trail, no placeholder, nothing naming it.
  const internalParent = (
    await api<{ guide: DraftGuide }>(page.request, `/api/studio/${workspace}/guides`, 'POST', {
      document: toStructuredDocument(
        {
          schemaVersion: 3,
          title: `Internal range ${suffix}`,
          summary: 'Members only.',
          locale: 'en',
          difficulty: 'easy',
          durationMinutes: 5,
          tools: [],
          steps: [
            {
              id: randomUUID(),
              title: 'Internal step',
              body: [
                { type: 'paragraph', children: [{ type: 'text', text: 'Internal.', marks: [] }] },
              ],
              media: [],
              callouts: [],
            },
          ],
        },
        randomUUID,
      ),
      categoryId: section.id,
      audience: 'members',
    })
  ).guide;
  await publish(internalParent.id, internalParent.version);
  expect((await setParent(model.id, internalParent.id)).status()).toBe(200);

  await visitor.goto(`/guides/${model.id}`);
  await expect(visitor.getByRole('navigation', { name: 'Broader guides' })).toHaveCount(0);
  await expect(visitor.getByText(`Internal range ${suffix}`)).toHaveCount(0);
  // The child itself is still perfectly readable on its own.
  await expect(visitor.getByRole('heading', { name: `Fridge model A ${suffix}` })).toBeVisible();
  await anonymous.close();
});

test('a guide moves between the public and internal sections, and says what it cannot undo', async ({
  page,
  browser,
}) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const open = await category(page.request, workspace, `Open shelf ${suffix}`);

  const internal = (
    await api<{ guide: DraftGuide }>(page.request, `/api/studio/${workspace}/guides`, 'POST', {
      document: toStructuredDocument(
        {
          schemaVersion: 3,
          title: `Team only ${suffix}`,
          summary: 'Written for the team first.',
          locale: 'en',
          difficulty: 'easy',
          durationMinutes: 5,
          tools: [],
          steps: [
            {
              id: randomUUID(),
              title: 'Check the seal',
              body: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Check the seal.', marks: [] }],
                },
              ],
              media: [],
              callouts: [],
            },
          ],
        },
        randomUUID,
      ),
      categoryId: open.id,
      audience: 'members',
    })
  ).guide;
  await api(page.request, `/api/studio/${workspace}/guides/${internal.id}/publish`, 'POST', {
    expectedVersion: internal.version,
    expectedRelease: null,
    license: 'all-rights-reserved',
  });

  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto(`/guides/${internal.id}`);
  await expect(visitor.getByRole('heading', { name: `Team only ${suffix}` })).toHaveCount(0);

  // The author moves it out to the public section.
  await page.goto(`/studio/${workspace}/${internal.id}`);
  await page.getByRole('button', { name: 'Guide details' }).click();
  await expect(page.getByText('Only members of this workspace can read this guide.')).toBeVisible();
  await page.getByRole('button', { name: 'Move to the public section' }).click();
  await expect(page.getByText('now in the public library')).toBeVisible();

  await visitor.goto(`/guides/${internal.id}`);
  await expect(visitor.getByRole('heading', { name: `Team only ${suffix}` })).toBeVisible();

  // And back in again. The wording does not promise a recall it cannot make.
  await page.reload();
  await page.getByRole('button', { name: 'Guide details' }).click();
  await expect(
    page.getByText('Anyone can read the published version of this guide.'),
  ).toBeVisible();
  await expect(
    page.getByText(/any licence it was published under still applies to those/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Move to the internal section' }).click();
  await expect(page.getByText('no longer served publicly')).toBeVisible();

  await visitor.goto(`/guides/${internal.id}`);
  await expect(visitor.getByRole('heading', { name: `Team only ${suffix}` })).toHaveCount(0);
  await anonymous.close();

  // A guide filed under a members-only category is told why, before it asks.
  const closed = await api<{ category: Category }>(
    page.request,
    `/api/studio/${workspace}/categories`,
    'POST',
    {
      name: `Closed shelf ${suffix}`,
      parentId: null,
      domain: 'guide',
      visibility: 'members',
      description: '',
      sortOrder: 0,
    },
  );
  const filed = (
    await api<{ guide: DraftGuide }>(page.request, `/api/studio/${workspace}/guides`, 'POST', {
      document: toStructuredDocument(
        {
          schemaVersion: 3,
          title: `Filed away ${suffix}`,
          summary: 'Filed on the closed shelf.',
          locale: 'en',
          difficulty: 'easy',
          durationMinutes: 5,
          tools: [],
          steps: [
            {
              id: randomUUID(),
              title: 'Only step',
              body: [
                { type: 'paragraph', children: [{ type: 'text', text: 'Do it.', marks: [] }] },
              ],
              media: [],
              callouts: [],
            },
          ],
        },
        randomUUID,
      ),
      categoryId: closed.category.id,
      audience: 'members',
    })
  ).guide;
  await api(page.request, `/api/studio/${workspace}/guides/${filed.id}/publish`, 'POST', {
    expectedVersion: filed.version,
    expectedRelease: null,
    license: 'all-rights-reserved',
  });

  await page.goto(`/studio/${workspace}/${filed.id}`);
  await page.getByRole('button', { name: 'Guide details' }).click();
  await expect(page.getByText('This guide cannot move to the public section yet:')).toBeVisible();
  await expect(
    page.getByText(`It is published under Closed shelf ${suffix}, which only members can see.`),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move to the public section' })).toHaveCount(0);

  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
});

test('an author marks up a photograph, and the marks reach the reader with their labels', async ({
  page,
  browser,
}) => {
  const sharp = (await import('sharp')).default;
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const section = await category(page.request, workspace, `Marked up ${suffix}`);

  const picture = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#3b5e52' },
  })
    .jpeg()
    .toBuffer();
  const uploaded = await page.request.post(`/api/studio/${workspace}/assets`, {
    headers,
    multipart: { file: { name: 'case.jpg', mimeType: 'image/jpeg', buffer: picture } },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const assetId = (await uploaded.json()).asset.id as string;

  const guide = await draft(page.request, workspace, section.id, `Marked guide ${suffix}`);
  await api(page.request, `/api/studio/${workspace}/guides/${guide.id}`, 'PUT', {
    expectedVersion: guide.version,
    document: {
      ...guide.document,
      steps: guide.document.steps.map((step, index) =>
        index === 0
          ? { ...step, media: [{ assetId, alt: 'The underside of the case', annotations: [] }] }
          : step,
      ),
    },
    categoryId: section.id,
  });

  await page.goto(`/studio/${workspace}/${guide.id}`);
  const marks = page.locator('.studio-annotate-handle');
  await expect(marks).toHaveCount(0);

  // A mark added from the keyboard lands in the middle and moves from there.
  await page.getByRole('button', { name: 'Add a mark' }).click();
  await expect(marks).toHaveCount(1);
  await expect(marks.first()).toHaveAttribute('style', /left:\s?50%/);
  await marks.first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  await expect(marks.first()).toHaveAttribute('style', /left:\s?54%/);
  await expect(marks.first()).toHaveAttribute('style', /top:\s?52%/);
  // Shift is the fine adjustment, not another coarse step.
  await page.keyboard.press('Shift+ArrowRight');
  await expect(marks.first()).toHaveAttribute('style', /left:\s?54\.5%/);
  await page.getByRole('textbox', { name: 'Mark 1 label' }).fill('The centre screw');

  // An arrow has two ends, and the second one moves independently.
  await page.getByRole('button', { name: 'Add an arrow' }).click();
  await expect(marks).toHaveCount(3);
  await page.getByRole('textbox', { name: 'Arrow 2 label' }).fill('Slide the cover this way');
  const arrowPoint = page.getByRole('button', { name: /point\. Arrow keys move it/ });
  await arrowPoint.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(arrowPoint).toHaveAttribute('style', /left:\s?68%/);

  // Clicking the picture puts a mark where the pointer is, not in the middle.
  await page.locator('.studio-annotate-frame img').click({ position: { x: 40, y: 30 } });
  await expect(marks).toHaveCount(4);
  await page.getByRole('textbox', { name: 'Mark 3 label' }).fill('The corner clip');

  await publish(page);

  // What the reader gets: the drawing, and every label in a list beside it.
  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto(`/guides/${guide.id}`);
  await expect(visitor.getByAltText('The underside of the case')).toBeVisible();
  const legend = visitor.locator('.step-media-legend li');
  await expect(legend).toHaveText([
    'The centre screw',
    'Slide the cover this way',
    'The corner clip',
  ]);
  // The marker numbers match the legend, and sit where the author put them.
  await expect(visitor.locator('.step-media-mark').first()).toHaveAttribute(
    'style',
    /left:\s?54\.5%/,
  );
  await expect(visitor.locator('.step-media-mark').first()).toHaveText('1');
  await expect(visitor.locator('.step-media-arrows line')).toHaveCount(1);

  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze())
      .violations,
  ).toEqual([]);
  await anonymous.close();
});

test('pictures carry captions and can be put in order', async ({ page, browser }) => {
  const sharp = (await import('sharp')).default;
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const section = await category(page.request, workspace, `Captioned ${suffix}`);

  const upload = async (shade: string) => {
    const bytes = await sharp({
      create: { width: 200, height: 150, channels: 3, background: shade },
    })
      .jpeg()
      .toBuffer();
    const response = await page.request.post(`/api/studio/${workspace}/assets`, {
      headers,
      multipart: { file: { name: 'p.jpg', mimeType: 'image/jpeg', buffer: bytes } },
    });
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()).asset.id as string;
  };
  const [first, second] = [await upload('#204a3c'), await upload('#7a3b2e')];

  const guide = await draft(page.request, workspace, section.id, `Captioned guide ${suffix}`);
  await api(page.request, `/api/studio/${workspace}/guides/${guide.id}`, 'PUT', {
    expectedVersion: guide.version,
    document: {
      ...guide.document,
      steps: guide.document.steps.map((step, index) =>
        index === 0
          ? {
              ...step,
              media: [
                { assetId: first, alt: 'The case from above', caption: '', annotations: [] },
                { assetId: second, alt: 'The case from below', caption: '', annotations: [] },
              ],
            }
          : step,
      ),
    },
    categoryId: section.id,
  });

  await page.goto(`/studio/${workspace}/${guide.id}`);
  await expect(page.getByText('Picture 1 of 2')).toBeVisible();
  const captions = page.getByRole('textbox', { name: 'Caption' });
  await captions.first().fill('Taken before anything was removed.');
  await captions.nth(1).fill('The same case, turned over.');

  // The first picture cannot move earlier, and the last cannot move later.
  await expect(page.getByRole('button', { name: 'Move picture 1 earlier' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move picture 2 later' })).toBeDisabled();

  // Moving the second one earlier takes its caption and description with it.
  await page.getByRole('button', { name: 'Move picture 2 earlier' }).click();
  await expect(captions.first()).toHaveValue('The same case, turned over.');
  await expect(page.getByRole('textbox', { name: 'Description' }).first()).toHaveValue(
    'The case from below',
  );

  await publish(page);

  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto(`/guides/${guide.id}`);
  // The reader sees them in the order the author left them, each with its own
  // caption, and the descriptions still belong to the right pictures.
  await expect(visitor.locator('.step-media-caption')).toHaveText([
    'The same case, turned over.',
    'Taken before anything was removed.',
  ]);
  const images = visitor.locator('.step-media img');
  await expect(images.first()).toHaveAttribute('alt', 'The case from below');
  await expect(images.nth(1)).toHaveAttribute('alt', 'The case from above');
  await anonymous.close();
});

test('a picture is offered at several widths, and a narrow screen takes a small one', async ({
  page,
  browser,
}) => {
  const sharp = (await import('sharp')).default;
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const section = await category(page.request, workspace, `Widths ${suffix}`);

  // Detailed noise rather than flat colour, so the encoder cannot make every
  // size the same handful of bytes and hide a rendering that never shrank.
  const noise = Buffer.alloc(2000 * 1500 * 3);
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 256;
  const original = await sharp(noise, { raw: { width: 2000, height: 1500, channels: 3 } })
    .jpeg()
    .toBuffer();
  const uploaded = await page.request.post(`/api/studio/${workspace}/assets`, {
    headers,
    multipart: { file: { name: 'detail.jpg', mimeType: 'image/jpeg', buffer: original } },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const assetId = (await uploaded.json()).asset.id as string;

  const guide = await draft(page.request, workspace, section.id, `Wide guide ${suffix}`);
  await api(page.request, `/api/studio/${workspace}/guides/${guide.id}`, 'PUT', {
    expectedVersion: guide.version,
    document: {
      ...guide.document,
      steps: guide.document.steps.map((step, index) =>
        index === 0
          ? { ...step, media: [{ assetId, alt: 'A detailed panel', caption: '', annotations: [] }] }
          : step,
      ),
    },
    categoryId: section.id,
  });
  await api(page.request, `/api/studio/${workspace}/guides/${guide.id}/publish`, 'POST', {
    expectedVersion: guide.version + 1,
    expectedRelease: null,
    license: 'all-rights-reserved',
  });

  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  const base = `/api/media/${workspace}/${assetId}`;
  const sizeOf = async (query: string) => {
    const response = await visitor.request.get(`${base}${query}`);
    expect(response.status(), query || 'full').toBe(200);
    expect(response.headers()['content-type']).toBe('image/webp');
    return (await response.body()).byteLength;
  };
  const [small, medium, full] = [await sizeOf('?w=400'), await sizeOf('?w=800'), await sizeOf('')];
  // The point of the exercise: a phone is not made to download the big one.
  expect(small).toBeLessThan(medium);
  expect(medium).toBeLessThan(full);
  // Built once and kept, so the second request is the same bytes.
  expect(await sizeOf('?w=400')).toBe(small);

  // A width outside the allow-list is refused rather than rendered, so no
  // caller can ask the server for a thousand versions of one picture.
  expect((await visitor.request.get(`${base}?w=777`)).status()).toBe(404);
  expect((await visitor.request.get(`${base}?w=99999`)).status()).toBe(404);

  // The reader offers every width and lets the browser choose.
  await visitor.goto(`/guides/${guide.id}`);
  const image = visitor.getByAltText('A detailed panel');
  await expect(image).toBeVisible();
  const srcset = await image.getAttribute('srcset');
  expect(srcset).toContain('w=400 400w');
  expect(srcset).toContain('w=800 800w');
  expect(await image.getAttribute('sizes')).toContain('100vw');

  // A picture narrower than the width asked for is not enlarged to fill it.
  const smallUpload = await sharp({
    create: { width: 300, height: 200, channels: 3, background: '#1e3d34' },
  })
    .jpeg()
    .toBuffer();
  const secondary = await page.request.post(`/api/studio/${workspace}/assets`, {
    headers,
    multipart: { file: { name: 'small.jpg', mimeType: 'image/jpeg', buffer: smallUpload } },
  });
  const smallId = (await secondary.json()).asset.id as string;
  const asOwner = async (query: string) =>
    (await page.request.get(`/api/media/${workspace}/${smallId}${query}`, { headers })).body();
  expect((await asOwner('?w=800')).byteLength).toBe((await asOwner('')).byteLength);

  await anonymous.close();
});

test('a picture already in the workspace can be used again on another step', async ({
  page,
  browser,
}) => {
  const sharp = (await import('sharp')).default;
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const section = await category(page.request, workspace, `Reused ${suffix}`);

  const bytes = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#35506b' },
  })
    .jpeg()
    .toBuffer();
  const uploaded = await page.request.post(`/api/studio/${workspace}/assets`, {
    headers,
    multipart: { file: { name: 'bench.jpg', mimeType: 'image/jpeg', buffer: bytes } },
  });
  expect(uploaded.status(), await uploaded.text()).toBe(201);
  const assetId = (await uploaded.json()).asset.id as string;

  const guide = await draft(page.request, workspace, section.id, `Reuse guide ${suffix}`);
  await api(page.request, `/api/studio/${workspace}/guides/${guide.id}`, 'PUT', {
    expectedVersion: guide.version,
    document: {
      ...guide.document,
      steps: guide.document.steps.map((step, index) =>
        index === 0
          ? { ...step, media: [{ assetId, alt: 'The bench, clear', caption: '', annotations: [] }] }
          : step,
      ),
    },
    categoryId: section.id,
  });

  // On the second step, the same picture is offered rather than uploaded again.
  await page.goto(`/studio/${workspace}/${guide.id}`);
  await page.getByRole('button', { name: /^02/ }).click();
  await page.getByRole('button', { name: 'Use one already added' }).click();
  const chooser = page.getByRole('dialog');
  const picture = chooser
    .getByRole('button', { name: /320 × 240/ })
    .filter({ has: page.locator(`img[src*="${assetId}"]`) });
  await expect(picture).toBeVisible();
  // The grid asks for the smallest rendering, not the full-size picture.
  await expect(picture.locator('img')).toHaveAttribute('src', /w=400$/);
  await picture.click();
  await expect(chooser).toHaveCount(0);

  // It still needs its own description: the same photograph shows a different
  // thing on a different step.
  await page
    .getByRole('textbox', { name: 'Describe this picture' })
    .fill('The bench with the tools laid out');
  await page.getByRole('button', { name: 'Add to step' }).click();

  await publish(page);

  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto(`/guides/${guide.id}`);
  // One stored picture, two steps, two descriptions.
  await expect(visitor.getByAltText('The bench, clear')).toBeVisible();
  await expect(visitor.getByAltText('The bench with the tools laid out')).toBeVisible();
  const sources = await visitor
    .locator('.step-media img')
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLImageElement).getAttribute('src')));
  expect(new Set(sources).size).toBe(1);

  // A picture already on this step is not offered a second time. Asserted
  // against this picture rather than against an empty chooser: other guides in
  // this workspace have pictures too, and a test that assumed otherwise would
  // pass alone and fail in company.
  await page.goto(`/studio/${workspace}/${guide.id}`);
  await page.getByRole('button', { name: 'Use one already added' }).click();
  const reopened = page.getByRole('dialog');
  await expect(reopened).toBeVisible();
  await expect(reopened.locator(`img[src*="${assetId}"]`)).toHaveCount(0);
  await anonymous.close();
});

test('adding a picture from the page: progress, refusal, retry and removal', async ({ page }) => {
  const sharp = (await import('sharp')).default;
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const section = await category(page.request, workspace, `Upload ${suffix}`);
  const guide = await draft(page.request, workspace, section.id, `Upload guide ${suffix}`);

  const bytes = await sharp({
    create: { width: 300, height: 200, channels: 3, background: '#4a6b52' },
  })
    .jpeg()
    .toBuffer();

  await page.goto(`/studio/${workspace}/${guide.id}`);
  await page
    .locator('.studio-picture-add input[type=file]')
    .setInputFiles({ name: 'bench.jpg', mimeType: 'image/jpeg', buffer: bytes });

  // Every other picture test uploads through the API. This one uses the
  // control an author actually has.
  await expect(page.getByRole('textbox', { name: 'Describe this picture' })).toBeVisible({
    timeout: 15000,
  });

  // The author can see the picture they are describing. Readability followed a
  // live reference, and a picture being described has none yet — so the editor
  // asked for bytes it was refused and drew a broken image, here and on every
  // thumbnail in the list offering to reuse one.
  //
  // Asserted as "this picture loaded", not "nothing is broken": an image that
  // has not finished loading is neither, so counting broken ones passes while
  // the request is still in flight.
  const loaded = (where: string) =>
    expect
      .poll(
        () =>
          page
            .locator(where)
            .first()
            .evaluate(
              (img) =>
                (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
            ),
        { timeout: 15000 },
      )
      .toBe(true);
  await loaded('.studio-picture--pending img');

  await page.getByRole('textbox', { name: 'Describe this picture' }).fill('A clear bench');
  await page.getByRole('button', { name: 'Add to step' }).click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('A clear bench');
  await loaded('.studio-picture:not(.studio-picture--pending) img');

  // The control is this app's, not the browser's file widget showing through.
  // The input stays in the page so it is still reachable by keyboard, but it is
  // clipped to a point — it used to render as "Choose File / No file chosen",
  // 220px of browser chrome inside the dashed box.
  const widget = await page.locator('.studio-picture-add input[type=file]').boundingBox();
  expect(widget!.width).toBeLessThan(2);
  await expect(page.getByText('Drop one here, or choose a file')).toBeVisible();

  // A file the server will never accept is explained, and is not offered a
  // retry that would fail identically.
  await page.locator('.studio-picture-add input[type=file]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('this is not an image'),
  });
  await expect(page.getByText(/could not be read as an image|are supported/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);

  // A failure that might not repeat keeps the file, so the author is not sent
  // back to the file picker to find the same photograph again.
  await page.route('**/api/studio/*/assets', (route) => route.abort('connectionfailed'));
  await page
    .locator('.studio-picture-add input[type=file]')
    .setInputFiles({ name: 'bench2.jpg', mimeType: 'image/jpeg', buffer: bytes });
  await expect(page.getByText(/did not reach the server/)).toBeVisible();
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();

  await page.unroute('**/api/studio/*/assets');
  await retry.click();
  await expect(page.getByRole('textbox', { name: 'Describe this picture' })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole('textbox', { name: 'Describe this picture' }).fill('The bench again');
  await page.getByRole('button', { name: 'Add to step' }).click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveCount(2);

  // And a picture can be taken off the step again.
  await page.getByRole('button', { name: 'Remove picture' }).first().click();
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: 'Description' })).toHaveValue('The bench again');
});

test('a thing is added inside another from the row itself, and shows up there', async ({
  page,
}) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const parent = await category(page.request, workspace, `Home ${suffix}`);

  await page.goto(`/studio/${workspace}/categories`);
  await page.getByRole('searchbox', { name: 'Search things' }).fill(parent.name);
  const row = page.getByRole('row').filter({ hasText: `Home ${suffix}` });
  await expect(row).toBeVisible();

  // Added from the row, so nothing asks where it should go.
  await row.getByRole('button', { name: `Add a thing inside Home ${suffix}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(`Inside Home ${suffix}`)).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(`Kitchen ${suffix}`);
  await dialog.getByRole('button', { name: 'Add thing', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // It is filed underneath, and visible without hunting for it.
  await expect(page.getByRole('button', { name: `Kitchen ${suffix}`, exact: true })).toBeFocused();
  const tree = await api<{ categories: Category[] }>(
    page.request,
    `/api/studio/${workspace}/categories`,
  );
  const child = tree.categories.find(
    (item) => item.name === `Kitchen ${suffix}` && item.parentId === parent.id,
  );
  expect(child, 'the new thing should be filed inside the one it was added from').toBeTruthy();

  // Go deeper, from the child's own row.
  const childRow = page.getByRole('row').filter({ hasText: `Kitchen ${suffix}` });
  await childRow.getByRole('button', { name: `Add a thing inside Kitchen ${suffix}` }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(`Fridges ${suffix}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Add thing', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: `Fridges ${suffix}` })).toBeVisible();

  // Fold the branch away, then add into it. A new thing created inside
  // something currently folded used to stay hidden, which reads as the
  // creation having silently failed.
  await page.getByRole('button', { name: `Hide what is inside Home ${suffix}` }).click();
  await expect(page.getByRole('row').filter({ hasText: `Kitchen ${suffix}` })).toHaveCount(0);
  const topRow = page.getByRole('row').filter({ hasText: `Home ${suffix}` });
  await topRow.getByRole('button', { name: `Add a thing inside Home ${suffix}` }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(`Bathroom ${suffix}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Add thing', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: `Bathroom ${suffix}` })).toBeVisible();

  // And each row carries its support code without anybody asking for it.
  await expect(page.getByRole('columnheader', { name: /Code/ })).toBeVisible();
  await expect(topRow.getByText(parent.code, { exact: true })).toBeVisible();
});

test('a thing added while the table is filtered is shown and focused, not hidden', async ({
  page,
}) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  await page.goto(`/studio/${workspace}/categories`);
  const search = page.getByRole('searchbox', { name: 'Search things' });

  // A search that matches nothing, then a new thing that does not match it
  // either. It used to be created out of sight, with focus left behind.
  await search.fill(`zzzz ${suffix}`);
  await expect(page.getByRole('heading', { name: 'Nothing matches' })).toBeVisible();
  await page.getByRole('button', { name: 'Add a thing', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(`Unrelated ${suffix}`);
  await dialog.getByRole('button', { name: 'Add thing', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(search).toHaveValue('');
  await expect(
    page.getByRole('button', { name: `Unrelated ${suffix}`, exact: true }),
  ).toBeFocused();

  // The same under Inactive, where a new thing — always active — cannot appear.
  const status = page.getByRole('group', { name: 'Status' });
  await status.getByRole('button', { name: /^Inactive/ }).click();
  await page.getByRole('button', { name: 'Add a thing', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(`Fresh ${suffix}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Add thing', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(status.getByRole('button', { name: /^Active/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: `Fresh ${suffix}`, exact: true })).toBeFocused();
});

test('deactivating a record leaves focus on the table, not the page', async ({ page }) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const first = await category(page.request, workspace, `Leaving ${suffix} a`);
  await category(page.request, workspace, `Leaving ${suffix} b`);

  await page.goto(`/studio/${workspace}/categories`);
  await page.getByRole('searchbox', { name: 'Search things' }).fill(`Leaving ${suffix}`);
  await page.getByRole('button', { name: first.name, exact: true }).click();
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  const confirm = page.getByRole('dialog', { name: 'Deactivate this thing' });
  await confirm.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: first.name, exact: true })).toHaveCount(0);

  // Its row has gone from the Active table; the row now in its place has focus.
  await expect(
    page.getByRole('button', { name: `Leaving ${suffix} b`, exact: true }),
  ).toBeFocused();

  // With nothing left in the table, focus goes to the search.
  await page.getByRole('button', { name: `Leaving ${suffix} b`, exact: true }).click();
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await confirm.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Nothing matches' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search things' })).toBeFocused();

  // The catalog does the same.
  const item = (
    await api<{ item: CatalogItem }>(page.request, `/api/studio/${workspace}/catalog`, 'POST', {
      name: `Leaving item ${suffix}`,
      specification: '',
      description: '',
      manufacturer: '',
      model: '',
      partNumber: '',
      defaultUnit: 'each',
      visibility: 'public',
    })
  ).item;
  await page.goto(`/studio/${workspace}/catalog`);
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill(item.name);
  await page.getByRole('button', { name: item.name, exact: true }).click();
  await page.getByRole('button', { name: 'Deactivate', exact: true }).click();
  await page
    .getByRole('dialog', { name: /Deactivate/ })
    .last()
    .getByRole('button', { name: 'Deactivate', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Search catalog' })).toBeFocused();
});

test('a catalog item added under a filter that hides it is still where closing it lands', async ({
  page,
}) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  await page.goto(`/studio/${workspace}/catalog`);
  const status = page.getByRole('group', { name: 'Status' });
  await status.getByRole('button', { name: /^Inactive/ }).click();
  await page.getByRole('button', { name: 'New catalog item', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Item name', exact: true }).fill(`Placed ${suffix}`);
  await dialog.getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(page.getByRole('dialog', { name: `Placed ${suffix}` })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(status.getByRole('button', { name: /^Active/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: `Placed ${suffix}`, exact: true })).toBeFocused();
});

test('a thing gets a picture, and it reaches exactly the readers the thing does', async ({
  page,
  browser,
}) => {
  const sharp = (await import('sharp')).default;
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  await category(page.request, workspace, `Bicycles ${suffix}`);

  await page.goto(`/studio/${workspace}/categories`);
  await page.getByRole('button', { name: `Bicycles ${suffix}`, exact: true }).click();
  const details = page.getByRole('dialog', { name: `Bicycles ${suffix}`, exact: true });
  await expect(details.locator('.structured-thing-image')).toHaveCount(0);

  const bytes = await sharp({
    create: { width: 400, height: 300, channels: 3, background: '#2f6f5e' },
  })
    .jpeg()
    .toBuffer();
  await details
    .locator('input[type=file]')
    .setInputFiles({ name: 'bicycle.jpg', mimeType: 'image/jpeg', buffer: bytes });
  await expect(details.locator('.structured-thing-image')).toBeVisible({ timeout: 15000 });

  // A visitor browsing sees the picture in the row of things, not a folder mark.
  // It used to be a card in a 407px grid on the front page; that grid is gone
  // and the picture rides on the chip that filters by this thing.
  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto('/');
  const chips = visitor.getByRole('navigation', { name: /Guide/ });
  const chip = chips.getByRole('link', { name: `Bicycles ${suffix}` });
  await expect(chip).toBeVisible();
  await expect(chip.locator('img')).toBeVisible();
  const src = await chip.locator('img').getAttribute('src');
  // The media route serves an allow-list of widths and 404s anything else, so
  // asking for a size it does not serve is a broken picture, not a smaller one.
  expect(src).toContain('w=400');
  expect((await visitor.request.get(src!)).status()).toBe(200);

  // The chip is the way to the thing's own page — one address per category,
  // not a filter on one page and a page somewhere else — and that page carries
  // the picture at full size.
  await chip.click();
  await expect(visitor).toHaveURL(/\/categories\/[a-f0-9-]+$/);
  await expect(visitor.locator('.category-hero-image')).toBeVisible();
  await expect(
    visitor.getByRole('heading', { level: 1, name: `Bicycles ${suffix}` }),
  ).toBeVisible();

  // A picture asked for at a width the media route does not serve answers 404,
  // which draws as a broken image rather than an error — visible to a person,
  // invisible to toBeVisible(), since a broken image still takes up space.
  for (const where of ['/', visitor.url()]) {
    await visitor.goto(where);
    expect(
      await visitor.evaluate(() =>
        [...document.images]
          .filter((img) => img.complete && img.naturalWidth === 0)
          .map((img) => img.src),
      ),
    ).toEqual([]);
  }

  // The same picture on a members-only thing is not served to that visitor,
  // and the thing itself does not appear for them at all.
  const closed = await api<{ category: Category }>(
    page.request,
    `/api/studio/${workspace}/categories`,
    'POST',
    {
      domain: 'guide',
      parentId: null,
      name: `Members only ${suffix}`,
      description: '',
      visibility: 'members',
      sortOrder: 0,
    },
  );
  const uploaded = await page.request.post(`/api/studio/${workspace}/assets`, {
    headers,
    multipart: { file: { name: 'secret.jpg', mimeType: 'image/jpeg', buffer: bytes } },
  });
  const secretAsset = (await uploaded.json()).asset.id as string;
  const linked = await page.request.put(
    `/api/studio/${workspace}/categories/${closed.category.id}/image`,
    { headers, data: { assetId: secretAsset } },
  );
  expect(linked.status(), await linked.text()).toBe(200);

  expect((await visitor.request.get(`/api/media/${workspace}/${secretAsset}`)).status()).toBe(404);
  await visitor.goto('/');
  await expect(chips.getByRole('link', { name: `Members only ${suffix}` })).toHaveCount(0);

  // Removing it puts the folder mark back and stops serving the bytes.
  await page.reload();
  await page.getByRole('button', { name: `Bicycles ${suffix}`, exact: true }).click();
  await details.getByRole('button', { name: 'Remove' }).click();
  await expect(details.locator('.structured-thing-image')).toHaveCount(0);
  expect((await visitor.request.get(src!)).status()).toBe(404);
  await visitor.goto('/');
  await expect(chips.getByRole('link', { name: `Bicycles ${suffix}` }).locator('img')).toHaveCount(
    0,
  );
  await anonymous.close();
});

test('a refused upload writes nothing to disk', async ({ page }) => {
  const sharp = (await import('sharp')).default;
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  await login(page.request);
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();
  const mediaRoot = join(process.cwd(), '.media-authoring');
  const stranger = `nowhere-${randomUUID().slice(0, 8)}`;

  // The route used to decode and write the image and only then ask whether the
  // caller may create an asset here, so a 404 still left a file behind.
  const refused = await page.request.post(`/api/studio/${stranger}/assets`, {
    headers,
    multipart: { file: { name: 'probe.png', mimeType: 'image/png', buffer: bytes } },
  });
  expect(refused.status()).toBe(404);
  const after = await readdir(join(mediaRoot, stranger)).catch(() => [] as string[]);
  expect(after, 'a refused upload must leave no files').toEqual([]);
});

test('a guide is given a cover, and it is what the library shows', async ({ page, browser }) => {
  const sharp = (await import('sharp')).default;
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const section = await category(page.request, workspace, `Cover ${suffix}`);
  const guide = await draft(page.request, workspace, section.id, `Cover guide ${suffix}`);
  const bytes = await sharp({
    create: { width: 640, height: 360, channels: 3, background: '#3a5f7d' },
  })
    .png()
    .toBuffer();

  await page.goto(`/studio/${workspace}/${guide.id}`);
  // The editor opens on a step; the cover lives with the guide's own details.
  await page.getByRole('button', { name: /Guide details/ }).click();
  const cover = page.getByRole('group', { name: 'Cover picture' });
  await expect(cover).toBeVisible();
  await cover
    .locator('input[type=file]')
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: bytes });
  await expect(cover.getByRole('button', { name: 'Remove cover' })).toBeVisible({ timeout: 15000 });

  await publish(page);

  // The card shows the cover somebody chose, not the illustration every card
  // used to share and not a guess at one.
  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto('/');
  await visitor.getByRole('searchbox').fill(`Cover guide ${suffix}`);
  const card = visitor.locator('.guide-card').filter({ hasText: `Cover guide ${suffix}` });
  await expect(card.locator('.guide-card-cover')).toBeVisible({ timeout: 15000 });
  const src = await card.locator('.guide-card-cover').getAttribute('src');
  expect((await visitor.request.get(src!)).status()).toBe(200);
  await expect
    .poll(() =>
      card
        .locator('.guide-card-cover')
        .evaluate(
          (img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0,
        ),
    )
    .toBe(true);
  await anonymous.close();
});

test('a guide is given a kind of work, and the title writes itself from it', async ({ page }) => {
  await login(page.request);
  const suffix = randomUUID().slice(0, 8);
  await category(page.request, 'workshop', `Floorboard ${suffix}`);

  await page.goto('/studio/workshop/new');
  const kind = page.getByRole('group', { name: 'What kind of work is this?' });
  await expect(kind).toBeVisible();

  // The distinction the thing tree could not make: a floor is a thing, an
  // inspection is something you do to one.
  await expect(kind.getByRole('radio', { name: /Inspection/ })).toBeVisible();
  await expect(kind.getByRole('radio', { name: /Replacement/ })).toBeVisible();

  await kind.getByRole('radio', { name: /Inspection/ }).check();
  const answer = page.getByRole('textbox', { name: 'What are you checking?' });
  await expect(answer).toBeVisible();
  await answer.fill('Damp');

  // A type that asks nothing shows no question — and forgets the answer to the
  // one it replaced, so switching back cannot quietly reattach it.
  await kind.getByRole('radio', { name: /Teardown/ }).check();
  await expect(page.getByRole('textbox', { name: 'What are you checking?' })).toHaveCount(0);
  await kind.getByRole('radio', { name: /Inspection/ }).check();
  await expect(answer).toHaveValue('');
  await answer.fill('Damp');

  const title = page.getByRole('textbox', { name: 'Guide title', exact: true });
  // Nothing composes until there is a thing to compose about.
  await expect(title).toHaveValue('');
  await chooseCategory(page, `Floorboard ${suffix}`);
  await expect(title).toHaveValue(`Floorboard ${suffix} Damp Inspection`);

  // It keeps up as the answer changes.
  await answer.fill('Rot');
  await expect(title).toHaveValue(`Floorboard ${suffix} Rot Inspection`);

  // And it stops the moment the author disagrees with it.
  await title.fill('Checking the boards by hand');
  await answer.fill('Warping');
  await expect(title).toHaveValue('Checking the boards by hand');

  await page
    .getByRole('textbox', { name: 'Summary', exact: true })
    .fill('What to look for when a floor starts to move.');
  await page.getByRole('button', { name: 'Create draft', exact: true }).click();
  await expect(page).toHaveURL(/\/studio\/workshop\/[a-f0-9-]+$/);

  // The kind of work reached the database, and the answer with it.
  const guideId = page.url().split('/').pop()!;
  const stored = await page.request.get(`/api/studio/workshop/guides/${guideId}`);
  expect(stored.ok()).toBe(true);
  expect((await stored.json()).guide.guideType).toEqual({ key: 'inspection', subject: 'Warping' });
});

test('a dialog traps focus, closes on Escape and hands focus back', async ({ page }) => {
  // This used to run against the design workshop page's example dialog. That
  // page is gone, and every dialog left in the product is behind a sign-in, so
  // the check moved here and now runs against one people actually open.
  await login(page.request);
  await page.goto('/studio/workshop/new');

  const trigger = page.getByRole('button', { name: /^What is this about/ }).last();
  await trigger.click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();

  // Search away variable fixture records, then prove native traversal reaches
  // both actions and wraps back to the search in both directions.
  const search = dialog.getByRole('textbox', { name: 'Search things' });
  await search.fill(`No matching category ${randomUUID()}`);
  await expect(dialog.getByText('Nothing matches that. Try another name.')).toBeVisible();
  const add = dialog.getByRole('button', { name: 'Add a thing', exact: true });
  const close = dialog.getByRole('button', { name: 'Close dialog' });
  for (const control of [add, close, search, add, close, search]) {
    await pressTab(page);
    await expect(control).toBeFocused();
  }
  for (const control of [close, add, search]) {
    await pressTab(page, { shift: true });
    await expect(control).toBeFocused();
  }

  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('a dialog stays inside a narrow viewport', async ({ page }) => {
  await login(page.request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio/workshop/new');
  await page
    .getByRole('button', { name: /^What is this about/ })
    .last()
    .click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('@core an account created for someone cannot do anything until it picks a password', async ({
  page,
}) => {
  await login(page.request);
  const config = readConfig();

  // Put the signed-in owner back into the state the first-run administrator
  // starts in. Going through the database rather than the API because no route
  // sets this flag — the bootstrap does, once, before the app serves anything.
  // The authoring server runs against its own database, not the development
  // one, so pointing at GUIDE_OWNER_DATABASE_URL would update a row nobody
  // under test can see — which is exactly what it did on the first run.
  const ownerURL = new URL(config.GUIDE_OWNER_DATABASE_URL!);
  ownerURL.pathname = '/guide_app_e2e';
  const db = new pg.Client({ connectionString: ownerURL.href });
  await db.connect();
  const restore = async () =>
    db.query('UPDATE public.auth_user SET must_change_password=false WHERE email=$1', [
      config.GUIDE_LOCAL_OWNER_EMAIL,
    ]);
  try {
    await db.query('UPDATE public.auth_user SET must_change_password=true WHERE email=$1', [
      config.GUIDE_LOCAL_OWNER_EMAIL,
    ]);

    // The API refuses, not only the browser. This is the half commonly left
    // open by exempting its own /api routes.
    const refused = await page.request.get('/api/studio/workshop/guide-types');
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error.code).toBe('PASSWORD_CHANGE_REQUIRED');

    // And the studio shows the one thing this account may do.
    await page.goto('/studio/workshop');
    await expect(page.getByRole('heading', { name: 'Choose your own password.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Things/ })).toHaveCount(0);

    // A wrong current password is refused without saying which field was wrong.
    await page.getByLabel('Current password', { exact: true }).fill('not-the-password');
    await page.getByLabel('New password', { exact: true }).fill('a-much-longer-password');
    await page.getByLabel('New password again', { exact: true }).fill('a-much-longer-password');
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    await expect(page.getByText('That current password is not right.')).toBeVisible();

    // Mismatched confirmation never reaches the server.
    await page
      .getByLabel('Current password', { exact: true })
      .fill(config.GUIDE_LOCAL_OWNER_PASSWORD!);
    await page.getByLabel('New password again', { exact: true }).fill('something-else-entirely');
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    await expect(page.getByText('Those two do not match.')).toBeVisible();
  } finally {
    await restore();
    await db.end();
  }
});

test('@core somebody is invited, joins from the link, and the link then does nothing', async ({
  page,
  browser,
}) => {
  await login(page.request);
  const suffix = randomUUID().slice(0, 8);
  const invitee = `joiner-${suffix}@example.test`;

  await page.goto('/studio/workshop/people');
  await expect(page.getByRole('heading', { name: 'Who can reach this workspace.' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(invitee);
  // Not an exact match: a select's options are part of its label's text, so
  // the accessible name carries them too.
  await page.getByLabel(/They can/).selectOption('view');
  await page.getByRole('button', { name: 'Create an invitation', exact: true }).click();

  // Shown once, in full, because it cannot be recovered afterwards.
  await expect(page.getByRole('heading', { name: `Send this link to ${invitee}` })).toBeVisible();
  const link = (await page.locator('.invite-link code').textContent())!;
  expect(link).toContain('/invite/');
  await expect(page.locator('.invite-issued')).toContainText(invitee);

  // A stranger opens it — no account, no session.
  const stranger = await browser.newContext(browserContextOptions);
  const guest = await stranger.newPage();
  await guest.goto(link);
  await expect(guest.getByRole('heading', { name: /Join Workshop operations/ })).toBeVisible();
  await guest.getByRole('textbox', { name: 'Your name', exact: true }).fill('Sam Joiner');
  await guest.getByLabel('Password', { exact: true }).fill('a-perfectly-good-password');
  await guest.getByLabel('Password again', { exact: true }).fill('a-perfectly-good-password');
  await guest.getByRole('button', { name: /^Join Workshop operations/ }).click();
  await expect(guest).toHaveURL(/\/studio\/workshop$/);

  // They are in, and only as far as view goes.
  const theirSession = await guest.request.get('/api/studio/session');
  expect((await theirSession.json()).workspaces).toEqual([
    expect.objectContaining({ id: 'workshop', role: 'view' }),
  ]);
  expect((await guest.request.get('/api/studio/workshop/people')).status()).toBe(404);

  // The same link is spent. A copyable link that keeps working after
  // acceptance is a known failure; this is the assertion that says ours does not.
  const second = await browser.newContext(browserContextOptions);
  const late = await second.newPage();
  await late.goto(link);
  await expect(
    late.getByRole('heading', { name: 'This invitation is no longer valid.' }),
  ).toBeVisible();

  // And the manager's list now shows a member rather than a pending invitation.
  await page.reload();
  const member = page.locator('.people-who').filter({ hasText: invitee });
  await expect(member.locator('strong')).toHaveText('Sam Joiner');
  const pending = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Waiting to be accepted' }),
  });
  await expect(pending.getByText(invitee, { exact: true })).toHaveCount(0);

  await stranger.close();
  await second.close();
});

test('the editor remembers a parent that has never been published', async ({ page }) => {
  // The picker offers drafts as parents but reloaded its selection from the
  // reader's ancestor trail, which only contains published guides — so a saved
  // draft parent came back as no parent, and the author's choice was lost the
  // moment they reopened the guide.
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 8);
  const section = await category(page.request, workspace, `Family ${suffix}`);
  const parent = await draft(page.request, workspace, section.id, `Broad draft ${suffix}`);
  const child = await draft(page.request, workspace, section.id, `Narrow draft ${suffix}`);

  await page.goto(`/studio/${workspace}/${child.id}`);
  await page.getByRole('button', { name: /Guide details/ }).click();
  const picker = page.getByLabel('Part of a broader guide');
  await picker.selectOption(parent.id);
  await expect(page.getByText('Saved. This guide now sits beneath that one.')).toBeVisible({
    timeout: 15000,
  });

  // Reopened, the control still shows the guide that was chosen.
  await page.reload();
  await page.getByRole('button', { name: /Guide details/ }).click();
  await expect(page.getByLabel('Part of a broader guide')).toHaveValue(parent.id);
});

test('somebody who already has an account can be invited into another workspace', async ({
  page,
  browser,
}) => {
  // Acceptance assumed signing up would throw for an address that already had
  // an account. It does not — it hands back a user whose id does not exist — so
  // the membership insert broke its foreign key and the invitee was told the
  // service was unavailable. There was no path in for an existing account at all.
  await login(page.request);
  const suffix = randomUUID().slice(0, 8);
  const invitee = `returning-${suffix}@example.test`;
  const password = 'a-perfectly-good-password';

  // First workspace: they join the ordinary way and get an account.
  const first = await api<{ link: string }>(page.request, '/api/studio/workshop/people', 'POST', {
    email: invitee,
    role: 'view',
  });
  const stranger = await browser.newContext(browserContextOptions);
  const guest = await stranger.newPage();
  await guest.goto(first.link);
  await guest.getByRole('textbox', { name: 'Your name', exact: true }).fill('Robin Returning');
  await guest.getByLabel('Password', { exact: true }).fill(password);
  await guest.getByLabel('Password again', { exact: true }).fill(password);
  await guest.getByRole('button', { name: /^Join Workshop operations/ }).click();
  await expect(guest).toHaveURL(/\/studio\/workshop$/);

  // Second workspace: the same address, which now has an account.
  const second = await api<{ link: string }>(
    page.request,
    '/api/studio/repair-collective/people',
    'POST',
    { email: invitee, role: 'view' },
  );

  // Nobody signed in: the link says what to do rather than offering a sign-up
  // form that cannot succeed, and the API refuses outright.
  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto(second.link);
  await expect(visitor.getByText(/already has an account/)).toBeVisible();
  const refused = await visitor.request.post(
    `/api/invitations/${second.link.split('/invite/')[1]}`,
    { headers, data: {} },
  );
  expect(refused.status()).toBe(422);
  expect(await refused.text()).toContain('Sign in as it');
  await anonymous.close();

  // Signed in as the invited address, accepting works.
  await guest.goto(second.link);
  await guest.getByRole('button', { name: /^Join Repair collective/ }).click();
  await expect(guest).toHaveURL(/\/studio\/repair-collective$/);
  const session = await guest.request.get('/api/studio/session');
  const workspaces = (await session.json()).workspaces as { id: string }[];
  expect(workspaces.map((w) => w.id).sort()).toEqual(['repair-collective', 'workshop']);

  await stranger.close();
});

test('a workspace can be reached from the page you land on', async ({ page }) => {
  // People shipped with a navigation entry that only rendered once you were
  // already inside a workspace, so from /studio — the page you arrive at —
  // there was no route to it at all.
  await login(page.request);
  await page.goto('/studio');
  const card = page.locator('.studio-workspace').filter({ hasText: 'Workshop operations' });
  await expect(card.getByRole('link', { name: 'Manage', exact: true })).toHaveAttribute(
    'href',
    '/studio/workshop/manage',
  );
  await expect(card.getByRole('link', { name: 'Guides', exact: true })).toBeVisible();

  // Two hops to People, and both of them named.
  await card.getByRole('link', { name: 'Manage', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Set up this workspace.' })).toBeVisible();
  await page.getByRole('link', { name: /People/ }).click();
  await expect(page.getByRole('heading', { name: 'Who can reach this workspace.' })).toBeVisible();
});

test('the only person who manages a workspace is not offered a way out of it', async ({ page }) => {
  await login(page.request);
  await page.goto('/studio/workshop/people');
  await expect(page.getByRole('heading', { name: 'Who can reach this workspace.' })).toBeVisible();

  // Scoped to the owner's own row. Earlier scenarios leave other members in
  // this workspace, and an unscoped locator matched all of them — the first
  // version of this test passed only because it happened to run alone.
  const mine = page.locator('.people-list li').filter({ hasText: 'Local owner' });
  await expect(mine.getByRole('combobox', { name: /Permission for/ })).toBeDisabled();
  await expect(mine.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
  await expect(page.getByText('One person manages this workspace')).toBeVisible();
});

test('the library has a way into the studio that names where it goes', async ({
  page,
  browser,
}) => {
  // The only door from the public library used to be labelled "Write a guide",
  // so anyone looking for the catalog, things or people had no reason to press
  // it — and there was no other way through. This lives in the authoring suite
  // because the editor suite runs the sample library, which has no studio.
  await login(page.request);
  await page.goto('/');
  const door = page.getByRole('link', { name: /Open studio/ });
  await expect(door).toBeVisible();
  await expect(door).toHaveAttribute('href', '/studio');
  await door.click();
  await expect(page.getByRole('heading', { name: 'Where will you create?' })).toBeVisible();

  // A visitor has no studio to open. The same button offered it to everybody,
  // because it asked whether the installation had a database rather than
  // whether anybody was signed in.
  const anonymous = await browser.newContext(browserContextOptions);
  const visitor = await anonymous.newPage();
  await visitor.goto('/');
  await expect(visitor.getByRole('link', { name: /Open studio/ })).toHaveCount(0);
  await expect(visitor.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute(
    'href',
    '/sign-in',
  );
  await anonymous.close();
});

test('the header separates the installation from the workspace inside it', async ({ page }) => {
  await login(page.request);
  await page.goto('/studio/workshop/people');
  await expect(page.getByRole('heading', { name: 'Who can reach this workspace.' })).toBeVisible();

  // Where you are, on the top tier, next to the mark. Scoped to the header
  // because the page body names the workspace too.
  await expect(
    page.locator('.site-header-top').getByRole('link', { name: 'Workshop operations' }),
  ).toBeVisible();

  const sections = page.getByRole('navigation', { name: 'Studio navigation' });
  for (const label of ['Guides', 'Manage', 'Library'])
    await expect(sections.getByRole('link', { name: new RegExp(label) })).toBeVisible();
  // The structural sections are behind Manage now, not beside Guides.
  await expect(sections.getByRole('link', { name: 'Catalog', exact: true })).toHaveCount(0);

  // And the installation's own links are not among them. A single flat row
  // mixing "Workspaces" with "Catalog" is what made it impossible to tell which
  // navigation you were looking at.
  await expect(sections.getByRole('link', { name: 'Workspaces', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Workspaces', exact: true })).toBeVisible();
});

test('a guide is edited from the page you read it on, by whoever may', async ({
  page,
  browser,
}) => {
  await login(page.request);
  const suffix = randomUUID().slice(0, 8);
  const shelf = await category(page.request, 'workshop', `Edit-in-place ${suffix}`);
  const created = await draft(page.request, 'workshop', shelf.id, `Read and edit ${suffix}`);
  // Arranged through the API. What this scenario is about is the affordance on
  // the reading page, not the act of publishing.
  await api(page.request, `/api/studio/workshop/guides/${created.id}/publish`, 'POST', {
    expectedVersion: created.version,
    expectedRelease: null,
    license: 'all-rights-reserved',
  });

  // Read it where a member reads it.
  await page.goto(`/w/workshop/guides/${created.id}`);
  const edit = page.getByRole('link', { name: 'Edit', exact: true });
  await expect(edit).toBeVisible();
  await edit.click();
  await expect(page).toHaveURL(new RegExp(`/studio/workshop/${created.id}$`));

  // An anonymous visitor is not offered an editor. The workspace is private, so
  // they cannot see the page at all — which is the stronger statement.
  const stranger = await browser.newContext(browserContextOptions);
  const guest = await stranger.newPage();
  const seen = await guest.goto(`/w/workshop/guides/${created.id}`);
  expect(seen?.status()).toBe(404);
  await stranger.close();
});

test('managing a workspace is one place, and closed to someone who only views', async ({
  page,
  browser,
}) => {
  await login(page.request);
  await page.goto('/studio/workshop/manage');
  await expect(page.getByRole('heading', { name: 'Set up this workspace.' })).toBeVisible();

  // Each section says what it is for. A list of bare names would need the
  // reader to already know the difference between things and the catalog.
  for (const [name, href] of [
    ['Things', '/studio/workshop/categories'],
    ['Catalog', '/studio/workshop/catalog'],
    ['People', '/studio/workshop/people'],
  ] as const) {
    const link = page.getByRole('link', { name: new RegExp(name) });
    await expect(link).toHaveAttribute('href', href);
    await expect(link).not.toHaveText(name); // it carries a description too
  }

  // And somebody who can only view is refused it. Written because the first
  // version of this scenario asserted only the half that was easy to reach.
  const invitee = `viewer-${randomUUID().slice(0, 8)}@example.test`;
  const invite = await api<{ link: string }>(page.request, '/api/studio/workshop/people', 'POST', {
    email: invitee,
    role: 'view',
  });
  const theirs = await browser.newContext(browserContextOptions);
  const them = await theirs.newPage();
  await them.goto(invite.link);
  await them.getByRole('textbox', { name: 'Your name', exact: true }).fill('Only A Viewer');
  await them.getByLabel('Password', { exact: true }).fill('a-perfectly-good-password');
  await them.getByLabel('Password again', { exact: true }).fill('a-perfectly-good-password');
  await them.getByRole('button', { name: /^Join Workshop operations/ }).click();
  await expect(them).toHaveURL(/\/studio\/workshop$/);

  await them.goto('/studio/workshop/manage');
  await expect(
    them.getByText('Only someone who manages this workspace can set it up.'),
  ).toBeVisible();
  // And it is not offered to them in the first place.
  await expect(
    them
      .getByRole('navigation', { name: 'Studio navigation' })
      .getByRole('link', { name: 'Manage' }),
  ).toHaveCount(0);
  await theirs.close();
});

test('nobody is asked to choose from a list of one workspace', async ({ page }) => {
  await login(page.request);
  const config = readConfig();
  const ownerURL = new URL(config.GUIDE_OWNER_DATABASE_URL!);
  ownerURL.pathname = '/guide_app_e2e';
  const db = new pg.Client({ connectionString: ownerURL.href });
  await db.connect();

  // With more than one, the list is worth showing.
  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: 'Where will you create?' })).toBeVisible();

  const standIn = `stand-in-${randomUUID().slice(0, 8)}`;
  try {
    // An installation serves one organisation, so one workspace is the normal
    // shape and this page would otherwise ask you to pick from a list of one.
    //
    // A stand-in manager goes in first: the database refuses to leave a
    // workspace with nobody who can manage it, which is the rule working
    // rather than a problem with this scenario.
    await db.query(
      'INSERT INTO public.auth_user(id,name,email,email_verified,active) VALUES($1,$1,$1 || $2,true,true)',
      [standIn, '@example.test'],
    );
    await db.query(
      "INSERT INTO app.membership(workspace_id,actor_id,role) VALUES('repair-collective',$1,'manage')",
      [standIn],
    );
    await db.query(
      "UPDATE app.membership SET active=false WHERE workspace_id='repair-collective' AND actor_id=(SELECT id FROM public.auth_user WHERE email=$1)",
      [config.GUIDE_LOCAL_OWNER_EMAIL],
    );
    await page.goto('/studio');
    await expect(page).toHaveURL(/\/studio\/workshop$/);
    await expect(page.getByRole('heading', { name: 'Where will you create?' })).toHaveCount(0);
  } finally {
    await db.query(
      "UPDATE app.membership SET active=true WHERE workspace_id='repair-collective' AND actor_id=(SELECT id FROM public.auth_user WHERE email=$1)",
      [config.GUIDE_LOCAL_OWNER_EMAIL],
    );
    await db.query('DELETE FROM app.membership WHERE actor_id=$1', [standIn]);
    await db.query('DELETE FROM public.auth_user WHERE id=$1', [standIn]);
    await db.end();
  }
});

test('management tables sort text, number and status columns, remember their columns, and survive opening a record', async ({
  page,
}) => {
  test.setTimeout(300000);
  await login(page.request);
  const workspace = 'repair-collective';
  const suffix = randomUUID().slice(0, 6);
  // Enough items with this suffix to need a second page on their own.
  const names = Array.from(
    { length: 27 },
    (_, n) => `Sorter ${suffix} ${String(n).padStart(2, '0')}`,
  );
  // Twenty-seven writes on top of everything the suite has already done can
  // meet the API's per-minute limit, which is right to refuse them. So each
  // write waits its turn, as the showcase seed does, rather than failing.
  const created: CatalogItem[] = [];
  const patiently = async (data: unknown) => {
    for (let tries = 0; ; tries++) {
      const response = await page.request.post(`/api/studio/${workspace}/catalog`, {
        headers,
        data,
      });
      if (response.status() !== 429 || tries >= 3) {
        expect(response.ok(), await response.text()).toBeTruthy();
        created.push((await response.json()).item);
        return;
      }
      await page.waitForTimeout(Number(response.headers()['retry-after'] ?? 60) * 1000);
    }
  };
  for (const [n, name] of names.entries())
    await patiently({
      name,
      specification: `${27 - n} mm`,
      description: '',
      manufacturer: n % 2 ? 'Even' : 'Odd',
      model: '',
      partNumber: `P-${suffix}-${String(n).padStart(3, '0')}`,
      defaultUnit: 'each',
      visibility: 'public',
    });

  await page.goto(`/studio/${workspace}/catalog`);
  const table = page.getByRole('table', { name: 'Catalog items' });
  const firstNames = () =>
    table.getByRole('rowheader').evaluateAll((cells) => cells.map((cell) => cell.textContent));
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill(`Sorter ${suffix}`);
  await expect(page.getByText('27 items', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Items pages' })).toContainText(
    'Showing 1–25 of 27 items',
  );

  // Sorting now comes from the server; wait for the ordered rows, not just the header state.
  // Sorted by name on arrival, and a header reverses it.
  const name = table.getByRole('columnheader', { name: /Name/ });
  await expect(name).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(async () => (await firstNames())[0]).toBe(names[0]);
  await name.getByRole('button').click();
  await expect(name).toHaveAttribute('aria-sort', 'descending');
  await expect.poll(async () => (await firstNames())[0]).toBe(names[26]);

  // Every other column sorts too. Specification counts down as names count up.
  const specification = table.getByRole('columnheader', { name: /Specification/ });
  await specification.getByRole('button').click();
  await expect(specification).toHaveAttribute('aria-sort', 'ascending');
  await expect(name).toHaveAttribute('aria-sort', 'none');
  await expect.poll(async () => (await firstNames())[0]).toBe(names[26]);

  // The sort holds through a status change and a narrower search.
  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^All/ }).click();
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill(`Sorter ${suffix} 0`);
  await expect(specification).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(firstNames).toEqual(names.slice(0, 10).reverse());

  // A hidden column can be shown, and the choice outlives a reload. The name
  // column cannot be hidden, so a row can always be opened.
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: /Name/ })).toBeDisabled();
  await page.getByRole('menuitemcheckbox', { name: 'Manufacturer' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Specification' }).click();
  await page.keyboard.press('Escape');
  await expect(table.getByRole('columnheader', { name: /Manufacturer/ })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /Specification/ })).toHaveCount(0);
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill(`Sorter ${suffix}`);
  await expect(table.getByRole('columnheader', { name: /Manufacturer/ })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: /Specification/ })).toHaveCount(0);

  // The column that was hidden sorts like any other: Even before Odd.
  const manufacturer = table.getByRole('columnheader', { name: /Manufacturer/ });
  await manufacturer.getByRole('button').click();
  await expect(manufacturer).toHaveAttribute('aria-sort', 'ascending');
  await expect
    .poll(async () => (await firstNames()).slice(0, 13))
    .toEqual(names.filter((_, n) => n % 2));
  await name.getByRole('button').click();
  await expect(name).toHaveAttribute('aria-sort', 'ascending');

  // Page two, then open a record and close it: the same page, search and sort
  // come back, and focus returns to the row it was opened from.
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Items pages' })).toContainText(
    'Showing 26–27 of 27 items',
  );
  await page.getByRole('button', { name: names[26], exact: true }).click();
  await expect(page.getByRole('dialog', { name: names[26] })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: names[26], exact: true })).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Items pages' })).toContainText(
    'Showing 26–27 of 27 items',
  );
  await expect(page.getByRole('searchbox', { name: 'Search catalog' })).toHaveValue(
    `Sorter ${suffix}`,
  );

  // Status sorts active before inactive, and the other way round.
  for (const n of [3, 5]) {
    const item = created[n]!;
    await api(page.request, `/api/studio/${workspace}/catalog/${item.id}`, 'PATCH', {
      name: item.name,
      specification: item.specification,
      description: item.description,
      manufacturer: item.manufacturer,
      model: item.model,
      partNumber: item.partNumber,
      defaultUnit: item.defaultUnit,
      visibility: item.visibility,
      expectedVersion: item.version,
      archived: true,
    });
  }
  await page.reload();
  await page.getByRole('searchbox', { name: 'Search catalog' }).fill(`Sorter ${suffix} 0`);
  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^All/ }).click();
  const status = table.getByRole('columnheader', { name: /Status/ });
  await status.getByRole('button').click();
  await expect(status).toHaveAttribute('aria-sort', 'ascending');
  await expect
    .poll(async () => (await firstNames()).slice(-2).sort())
    .toEqual([names[3], names[5]]);
  await status.getByRole('button').click();
  await expect(status).toHaveAttribute('aria-sort', 'descending');
  await expect
    .poll(async () => (await firstNames()).slice(0, 2).sort())
    .toEqual([names[3], names[5]]);

  // Things: an opened branch stays open across a record's sheet, and the
  // guide total says where its guides are.
  const root = await category(page.request, workspace, `Outer ${suffix}`);
  const inner = await category(page.request, workspace, `Inner ${suffix}`, 'guide', root.id);
  await draft(page.request, workspace, root.id, `Filed outside ${suffix}`);
  await draft(page.request, workspace, inner.id, `Filed inside ${suffix}`);
  await page.goto(`/studio/${workspace}/categories`);
  await page.getByRole('searchbox', { name: 'Search things' }).fill(suffix);
  await page.getByRole('button', { name: `Hide what is inside Outer ${suffix}` }).click();
  await page.getByRole('button', { name: `Show what is inside Outer ${suffix}` }).click();
  await expect(page.getByRole('button', { name: `Inner ${suffix}`, exact: true })).toBeVisible();
  const outerRow = page.getByRole('row').filter({ hasText: `Outer ${suffix}` });
  await expect(outerRow.getByTitle('1 here + 1 inside')).toHaveText('2');
  await page.getByRole('button', { name: `Inner ${suffix}`, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: `Inner ${suffix}`, exact: true })).toBeFocused();
  await expect(
    page.getByRole('button', { name: `Hide what is inside Outer ${suffix}` }),
  ).toHaveAttribute('aria-expanded', 'true');

  // Opening a branch is not opening the record.
  await page.getByRole('button', { name: `Hide what is inside Outer ${suffix}` }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Guides sort as numbers: a second top-level thing with one guide, and one
  // with none, around Outer's two.
  const single = await category(page.request, workspace, `Single ${suffix}`);
  await category(page.request, workspace, `Empty ${suffix}`);
  await draft(page.request, workspace, single.id, `Filed alone ${suffix}`);
  await page.reload();
  const things = page.getByRole('table', { name: 'Things' });
  await page.getByRole('searchbox', { name: 'Search things' }).fill(suffix);
  // Searching opens the matches inside matches, so Inner shows under Outer.
  await expect(page.getByRole('button', { name: `Inner ${suffix}`, exact: true })).toBeVisible();
  const guides = things.getByRole('columnheader', { name: /Guides/ });
  await guides.getByRole('button').click();
  await expect(guides).toHaveAttribute('aria-sort', 'ascending');
  const order = async () =>
    (await things.getByRole('rowheader').allTextContents()).filter((text) =>
      /^(Empty|Single|Outer)/.test(text),
    );
  await expect
    .poll(async () => (await order()).map((text) => text.split(' ')[0]))
    .toEqual(['Empty', 'Single', 'Outer']);
  await guides.getByRole('button').click();
  await expect(guides).toHaveAttribute('aria-sort', 'descending');
  await expect
    .poll(async () => (await order()).map((text) => text.split(' ')[0]))
    .toEqual(['Outer', 'Single', 'Empty']);
});
