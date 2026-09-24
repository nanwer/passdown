import { browserContextOptions } from '../support/browser';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { readConfig } from '../../scripts/local-config.mjs';
import { guideDocumentSchema, toStructuredDocument } from '@guide/content';

const credentials = readConfig();
const origin = 'http://127.0.0.1:3101';
const workspace = 'repair-collective';
const prefix = `Paging ${randomUUID().slice(0, 8)}`;
const parentId = randomUUID();
const parentName = `${prefix} branch`;
const children = Array.from({ length: 54 }, (_, n) => ({
  id: randomUUID(),
  itemId: randomUUID(),
  name: `${prefix} ${String(n).padStart(2, '0')}`,
}));

async function login(request: APIRequestContext) {
  const response = await request.post('/api/auth/sign-in/email', {
    headers: { Origin: origin },
    data: {
      email: credentials.GUIDE_LOCAL_OWNER_EMAIL,
      password: credentials.GUIDE_LOCAL_OWNER_PASSWORD,
    },
  });
  expect(response.status()).toBe(200);
}

// Bulk fixtures are confined to the disposable browser database. They avoid
// spending the mutation API's abuse-prevention budget on setup; all browsing,
// filtering and creation assertions below go through the real application.
test.beforeAll(async () => {
  const url = new URL(credentials.GUIDE_OWNER_DATABASE_URL!);
  url.pathname = '/guide_app_e2e';
  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  try {
    await db.query(
      `INSERT INTO app.category(id,workspace_id,domain,name,visibility)
       VALUES($1,$2,'guide',$3,'public')`,
      [parentId, workspace, parentName],
    );
    for (const [n, entry] of children.entries()) {
      const visibility = n % 2 ? 'members' : 'public';
      await db.query(
        `INSERT INTO app.category(id,workspace_id,domain,parent_id,name,visibility,archived)
         VALUES($1,$2,'guide',$3,$4,$5,$6)`,
        [entry.id, workspace, parentId, entry.name, visibility, n >= 48],
      );
      await db.query(
        `INSERT INTO app.catalog_item(id,workspace_id,name,specification,default_unit,visibility,archived)
         VALUES($1,$2,$3,$4,'each',$5,$6)`,
        [entry.itemId, workspace, entry.name, `${54 - n} mm`, visibility, n >= 48],
      );
      if (n < 6) {
        const guideId = randomUUID();
        const requirementId = randomUUID();
        const document = toStructuredDocument({
          schemaVersion: 3,
          title: entry.name,
          summary: 'Paging fixture',
          locale: 'en',
          difficulty: 'easy',
          durationMinutes: 1,
          tools: [],
          steps: [
            {
              id: randomUUID(),
              title: 'Prepare',
              body: [
                {
                  type: 'paragraph',
                  children: [{ type: 'text', text: 'Prepare the item.', marks: [] }],
                },
              ],
              media: [],
              callouts: [],
            },
          ],
        });
        document.requirements = [
          {
            id: requirementId,
            itemId: entry.itemId,
            itemVersion: 1,
            role: 'keep',
            name: entry.name,
            specification: `${54 - n} mm`,
            description: '',
            manufacturer: '',
            model: '',
            partNumber: '',
            quantity: 1,
            unit: 'each',
            optional: false,
            notes: '',
          },
        ];
        await db.query(
          `INSERT INTO app.guide(id,workspace_id,audience,document,category,category_id,author)
           VALUES($1,$2,'members',$3,$4,$5,'Paging fixture')`,
          [
            guideId,
            workspace,
            JSON.stringify(guideDocumentSchema.parse(document)),
            entry.name,
            entry.id,
          ],
        );
        await db.query(
          `INSERT INTO app.guide_requirement_reference(workspace_id,guide_id,requirement_id,item_id,item_version)
           VALUES($1,$2,$3,$4,1)`,
          [workspace, guideId, requirementId, entry.itemId],
        );
      }
    }
  } finally {
    await db.end();
  }
});

async function openList(page: Page, kind: 'catalog' | 'categories') {
  await login(page.request);
  await page.goto(`/studio/${workspace}/${kind}`);
  await page
    .getByRole('searchbox', { name: kind === 'catalog' ? 'Search catalog' : 'Search things' })
    .fill(prefix);
  await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: /^All/ }).click();
}

test('catalog fetches bounded pages and sorts the entire result before paging', async ({
  page,
}) => {
  await openList(page, 'catalog');
  const pager = page.getByRole('navigation', { name: 'Items pages' });
  await expect(pager).toContainText('Showing 1–25 of 54 items');
  const request = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/catalog') && url.searchParams.get('page') === '2';
  });
  await pager.getByRole('button', { name: 'Next', exact: true }).click();
  const body = await (await request).json();
  expect(body.items).toHaveLength(25);
  expect(body.total).toBe(54);
  expect(body.page).toBe(2);
  expect(body.items[0].name).toBe(children[25]!.name);
  await expect(page.getByRole('button', { name: children[0]!.name, exact: true })).toHaveCount(0);
  await expect(pager).toContainText('Showing 26–50 of 54 items');
  const table = page.getByRole('table', { name: 'Catalog items' });
  await table.getByRole('columnheader', { name: /Name/ }).getByRole('button').click();
  await expect(pager).toContainText('Showing 1–25 of 54 items');
  await expect(table.getByRole('rowheader').first()).toHaveText(children[53]!.name);
  await pager.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(table.getByRole('rowheader').first()).toHaveText(children[28]!.name);
});

test('Things pages preserve ancestor context without downloading the whole expanded tree', async ({
  page,
}) => {
  await openList(page, 'categories');
  const pager = page.getByRole('navigation', { name: 'Rows pages' });
  await expect(pager).toContainText('Showing 1–25 of 55 rows');
  const request = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname.endsWith('/categories') && url.searchParams.get('page') === '2';
  });
  await pager.getByRole('button', { name: 'Next', exact: true }).click();
  const body = await (await request).json();
  expect(body.total).toBe(55);
  expect(body.rows.length).toBeLessThanOrEqual(41);
  expect(body.categories.length).toBeLessThanOrEqual(41);
  await expect(page.getByRole('button', { name: parentName, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: children[24]!.name, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: children[0]!.name, exact: true })).toHaveCount(0);
  await expect(pager).toContainText('Showing 26–50 of 55 rows');
});

for (const kind of ['catalog', 'categories'] as const)
  test(`${kind}: search, visibility, usage and status combine over all pages`, async ({ page }) => {
    await openList(page, kind);
    await page.getByRole('combobox', { name: 'Visibility', exact: true }).selectOption('members');
    await page.getByRole('combobox', { name: 'Guide usage', exact: true }).selectOption('used');
    const table = page.getByRole('table', {
      name: kind === 'catalog' ? 'Catalog items' : 'Things',
    });
    for (const n of [1, 3, 5])
      await expect(
        table.getByRole('button', { name: children[n]!.name, exact: true }),
      ).toBeVisible();
    await expect(table.getByRole('button', { name: children[0]!.name, exact: true })).toHaveCount(
      0,
    );
    await expect(table.getByRole('button', { name: children[7]!.name, exact: true })).toHaveCount(
      0,
    );
    const status = page.getByRole('group', { name: 'Status' });
    await expect(status.getByRole('button', { name: /^All/ })).toHaveText(/All\s*3/);
    await page.getByRole('combobox', { name: 'Guide usage', exact: true }).selectOption('unused');
    await expect(status.getByRole('button', { name: /^All/ })).toHaveText(/All\s*24/);
    await expect(status.getByRole('button', { name: /^Active/ })).toHaveText(/Active\s*21/);
    await expect(status.getByRole('button', { name: /^Inactive/ })).toHaveText(/Inactive\s*3/);
    await status.getByRole('button', { name: /^Inactive/ }).click();
    for (const n of [49, 51, 53])
      await expect(
        table.getByRole('button', { name: children[n]!.name, exact: true }),
      ).toBeVisible();
    await expect(table.getByRole('button', { name: children[47]!.name, exact: true })).toHaveCount(
      0,
    );
  });

test('paged management data and counts remain unavailable to an anonymous reader', async ({
  browser,
}) => {
  const visitor = await browser.newContext(browserContextOptions);
  try {
    for (const workspaceId of [workspace, 'workshop'])
      for (const resource of ['categories', 'catalog']) {
        const response = await visitor.request.get(
          `${origin}/api/studio/${workspaceId}/${resource}?page=1&pageSize=25&status=all&visibility=members&usage=used`,
        );
        expect([401, 403]).toContain(response.status());
        const body = await response.json();
        expect(body.total).toBeUndefined();
        expect(body.statusCounts).toBeUndefined();
      }
  } finally {
    await visitor.close();
  }
});

for (const kind of ['catalog', 'categories'] as const)
  test(`${kind}: creating a record clears incompatible filters and reveals its page`, async ({
    page,
  }) => {
    await openList(page, kind);
    await page.getByRole('combobox', { name: 'Visibility', exact: true }).selectOption('members');
    await page.getByRole('combobox', { name: 'Guide usage', exact: true }).selectOption('used');
    await page
      .getByRole('group', { name: 'Status' })
      .getByRole('button', { name: /^Inactive/ })
      .click();
    const name = `ZZ ${prefix} new`;
    const catalog = kind === 'catalog';
    await page
      .getByRole('button', { name: catalog ? 'New catalog item' : 'Add a thing', exact: true })
      .click();
    const dialog = page.getByRole('dialog', {
      name: catalog ? 'Create catalog item' : 'Add a thing',
      exact: true,
    });
    await dialog
      .getByRole('textbox', { name: catalog ? 'Item name' : 'Name', exact: true })
      .fill(name);
    await dialog
      .getByRole('button', { name: catalog ? 'Create item' : 'Add thing', exact: true })
      .click();
    if (catalog) {
      await expect(page.getByRole('dialog', { name, exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
    await expect(page.getByRole('combobox', { name: 'Visibility', exact: true })).toHaveValue(
      'all',
    );
    await expect(page.getByRole('combobox', { name: 'Guide usage', exact: true })).toHaveValue(
      'all',
    );
    await expect(
      page.getByRole('navigation', { name: catalog ? 'Items pages' : 'Rows pages' }),
    ).toContainText('Showing 26–');
  });

test('an open thing keeps its guide counts after a rename leaves the current search', async ({
  page,
}) => {
  await openList(page, 'categories');
  await page.getByRole('searchbox', { name: 'Search things' }).fill(children[0]!.name);
  await page.getByRole('button', { name: children[0]!.name, exact: true }).click();
  const record = page.getByRole('dialog', { name: children[0]!.name, exact: true });
  await expect(record.getByText('1 — 1 here', { exact: true })).toBeVisible();
  await record.getByRole('button', { name: 'Edit or move', exact: true }).click();
  const edit = page.getByRole('dialog', { name: 'Edit thing', exact: true });
  const renamed = `Renamed ${randomUUID().slice(0, 8)}`;
  await edit.getByRole('textbox', { name: 'Name', exact: true }).fill(renamed);
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(edit).toBeHidden();
  const updated = page.getByRole('dialog', { name: renamed, exact: true });
  await expect(updated).toBeVisible();
  // The open sheet correctly hides the background table from assistive technology.
  await expect(
    page.getByRole('heading', { name: 'Nothing matches', exact: true, includeHidden: true }),
  ).toBeVisible();
  await expect(updated.getByText('1 — 1 here', { exact: true })).toBeVisible();
});
