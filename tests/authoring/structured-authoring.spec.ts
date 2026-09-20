import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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
async function chooseCategory(page: Page, name: string, label = 'Category') {
  await page
    .getByRole('button', { name: new RegExp(`^${label}`) })
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
    await page.getByRole('button', { name: 'New category', exact: true }).click();
    for (let level = 0; level < names.length; level++) {
      const dialog = page.getByRole('dialog').last();
      await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(names[level]!);
      await dialog.getByRole('button', { name: 'Create category', exact: true }).click();
      await expect(
        page
          .getByRole('region', { name: 'Category details' })
          .getByRole('heading', { name: names[level], exact: true }),
      ).toBeVisible();
      if (level < names.length - 1)
        await page.getByRole('button', { name: 'Add subcategory', exact: true }).click();
    }
    const tree = await api<{ categories: Category[] }>(
      page.request,
      `/api/studio/${workspace}/categories`,
    );
    const leaf = tree.categories.find((item) => item.name === names[4])!;
    const root = tree.categories.find((item) => item.name === names[0])!;
    expect(leaf.path.map((part) => part.name)).toEqual(names);
    await page.reload();
    await expect(page.getByRole('button', { name: names[4], exact: true })).toBeVisible();
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
    await page.getByRole('button', { name: /^Category/ }).click();
    await page.getByRole('button', { name: 'Create subcategory', exact: true }).click();
    await page
      .getByRole('dialog')
      .last()
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill(`Procedures ${suffix}`);
    await page
      .getByRole('dialog')
      .last()
      .getByRole('button', { name: 'Create category', exact: true })
      .click();
    await expect(page.getByRole('textbox', { name: 'Guide title', exact: true })).toHaveValue(
      title,
    );
    await expect(page.getByRole('button', { name: /^Category/ })).toContainText(
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
    await expect(reader.getByRole('navigation', { name: 'Category path' })).toContainText(
      names[0]!,
    );
    // Category assignments stay drafts until publication.
    await page.getByRole('button', { name: 'Guide details', exact: false }).click();
    await chooseCategory(page, root.name);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    await reader.reload();
    await expect(reader.getByRole('navigation', { name: 'Category path' })).toContainText(
      `Procedures ${suffix}`,
    );
    await page.goto(`/studio/${workspace}/categories`);
    await page.getByRole('button', { name: root.name, exact: true }).click();
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    // What blocks retirement is now explained before the attempt and the
    // confirm stays disabled, rather than a refusal arriving after a click.
    await expect(page.getByRole('dialog').locator('.structured-blockers')).toContainText(
      /Move|guide|categor/i,
    );
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Archive category', exact: true }),
    ).toBeDisabled();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: leaf.name, exact: true }).click();
    await page.getByRole('button', { name: 'Edit or move', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('textbox', { name: 'Name', exact: true })
      .fill(`Renamed ${suffix}`);
    await chooseCategory(page, root.name, 'Parent category');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save category', exact: true })
      .click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Category details' })).toContainText(
      `Renamed ${suffix}`,
    );
    await reader.reload();
    await expect(reader.getByRole('navigation', { name: 'Category path' })).toContainText(
      `Renamed ${suffix}`,
    );
    await expect(reader.getByRole('heading', { name: title, exact: true })).toBeVisible();
    if (workspace === 'workshop') {
      const anonymous = await browser.newContext();
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
  const tools = await category(page.request, workspace, `Hand tools ${suffix}`, 'tool');
  const screwdrivers = await category(page.request, workspace, 'Screwdrivers', 'tool', tools.id);
  const phillips = await category(
    page.request,
    workspace,
    `Phillips ${suffix}`,
    'tool',
    screwdrivers.id,
  );
  const materials = await category(page.request, workspace, `Fasteners ${suffix}`, 'material');
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
  await chooseCategory(page, phillips.name, 'Item category');
  await page.getByRole('dialog').getByRole('button', { name: 'Create item', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Catalog item details' })).toContainText(
    'Phillips #00',
  );
  const tool = (
    await api<{ items: CatalogItem[] }>(page.request, `/api/studio/${workspace}/catalog`)
  ).items.find((item) => item.name === toolName)!;
  const partName = `Replacement screw ${suffix}`;
  const { item: part } = await api<{ item: CatalogItem }>(
    page.request,
    `/api/studio/${workspace}/catalog`,
    'POST',
    {
      categoryId: materials.id,
      kind: 'part',
      name: partName,
      specification: 'M2 × 4 mm',
      description: 'New replacement screws.',
      manufacturer: '',
      model: '',
      partNumber: '',
      defaultUnit: 'each',
      visibility: 'public',
    },
  );
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
    categoryId: tool.categoryId,
    kind: tool.kind,
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
  await page.getByRole('button', { name: /^Item category/ }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Create category', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('textbox', { name: 'Name', exact: true })
    .fill(`Organization tools ${suffix}`);
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: 'Create category', exact: true })
    .click();
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
  const anonymous = await browser.newContext();
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
  const row = page.getByRole('button', { name: target.name, exact: true });
  await expect(row).toBeVisible();
  await row.click();

  // The code is shown, and describes the row without becoming its name.
  await expect(page.getByText(target.code, { exact: true }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  const blockers = page.locator('.structured-blockers');
  await expect(blockers).toBeVisible();
  await expect(blockers).toContainText('guide assigned here');
  await expect(page.getByRole('button', { name: 'Archive category', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

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
  await page.getByRole('button', { name: target.name, exact: true }).click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('.structured-blockers')).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive category', exact: true }).click();
  await expect(page.getByText('Category archived', { exact: false })).toBeVisible();
});

test('catalog listing reports how many guides use each item and filters by status', async ({
  page,
}) => {
  await login(page.request);
  const workspace = 'repair-collective';
  const toolCategory = await category(
    page.request,
    workspace,
    `Hand tools ${randomUUID().slice(0, 8)}`,
    'tool',
  );
  const unused = (
    await api<{ item: CatalogItem }>(page.request, `/api/studio/${workspace}/catalog`, 'POST', {
      categoryId: toolCategory.id,
      kind: 'tool',
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
  const tabs = page.getByRole('group', { name: 'Item status' });
  await expect(tabs).toBeVisible();

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
  expect(all).toBe(active + inactive);

  // An item nothing references carries no usage badge.
  const row = page.getByRole('button', { name: new RegExp(unused.name) });
  await expect(row).toBeVisible();
  await expect(row.locator('.catalog-usage')).toHaveCount(0);
});

test('one site, two sections: members switch between public and internal, others see neither', async ({
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

  // A member sees the switch, and the public side stays a public-only view.
  await page.goto('/');
  const sections = page.getByRole('navigation', { name: 'Workspace sections' });
  await expect(sections).toBeVisible();
  await expect(page.getByText(internalTitle, { exact: false })).toHaveCount(0);

  // The internal side shows it.
  await sections.getByRole('link', { name: 'Internal' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${workspace}$`));
  await expect(page.getByText(internalTitle, { exact: false }).first()).toBeVisible();

  // A visitor gets neither the section nor a hint that it exists.
  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.goto('/');
  await expect(visitor.getByRole('navigation', { name: 'Workspace sections' })).toHaveCount(0);
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
  await expect(choice.getByText('cannot move between sections')).toBeVisible();

  // A private workspace has no public side, so there is nothing to choose.
  await page.goto('/studio/workshop/new');
  await expect(page.getByRole('group', { name: 'Section' })).toHaveCount(0);
  await expect(page.getByText('only visible to active workspace members')).toBeVisible();
});

test('a picture is re-encoded, shown to readers of the guide, and hidden from everyone else', async ({
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
  const anonymous = await browser.newContext();
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
  const anonymous = await browser.newContext();
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

  const anonymous = await browser.newContext();
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
    page.getByText(`It is published under Closed shelf ${suffix}, a members-only category.`),
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
  const anonymous = await browser.newContext();
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

  const anonymous = await browser.newContext();
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

  const anonymous = await browser.newContext();
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
  await expect(chooser.getByRole('button', { name: /320 × 240/ })).toBeVisible();
  // The grid asks for the smallest rendering, not the full-size picture.
  await expect(chooser.locator('img').first()).toHaveAttribute('src', /w=400$/);
  await chooser.getByRole('button', { name: /320 × 240/ }).click();
  await expect(chooser).toHaveCount(0);

  // It still needs its own description: the same photograph shows a different
  // thing on a different step.
  await page
    .getByRole('textbox', { name: 'Describe this picture' })
    .fill('The bench with the tools laid out');
  await page.getByRole('button', { name: 'Add to step' }).click();

  await publish(page);

  const anonymous = await browser.newContext();
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
