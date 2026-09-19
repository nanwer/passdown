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
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Archive category', exact: true })
      .click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
      /Move|referenc|children|categor/i,
    );
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
