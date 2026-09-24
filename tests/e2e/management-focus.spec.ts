import { test, expect, type Page } from '@playwright/test';

// Management screens with the studio API answered in the browser, so a
// response can be held back for exactly as long as a test needs.

const workspace = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Focus workspace',
  audience: 'public',
  isRoot: true,
  role: 'manage',
};
const thing = (id: string, name: string) => ({
  id,
  workspaceId: workspace.id,
  domain: 'guide',
  parentId: null,
  name,
  code: `TH-${id.slice(0, 4)}`,
  description: '',
  visibility: 'public',
  archived: false,
  version: 1,
  sortOrder: 0,
  imageAssetId: null,
  path: [{ id, name }],
});
const item = (n: number, name: string) => ({
  id: `77777777-7777-4777-8777-${String(n).padStart(12, '0')}`,
  workspaceId: workspace.id,
  name,
  specification: '',
  description: '',
  manufacturer: '',
  model: '',
  partNumber: '',
  defaultUnit: 'each',
  visibility: 'public',
  archived: false,
  version: 1,
  categoryId: null,
  categoryPath: [],
  imageAssetId: null,
});

async function signedIn(page: Page) {
  await page.route('**/api/studio/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'owner', name: 'Owner', email: 'owner@test.local' },
        workspaces: [workspace],
      },
    }),
  );
}

/** Things, where the list that follows a creation waits until released. */
async function thingsWithSlowRefresh(page: Page) {
  const things = [thing('55555555-5555-4555-8555-555555555555', 'Parent')];
  let created = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await signedIn(page);
  await page.route('**/api/studio/*/categories**', async (route) => {
    if (route.request().method() === 'POST') {
      const added = thing(
        '77777777-7777-4777-8777-777777777777',
        route.request().postDataJSON().name,
      );
      things.push(added);
      created = true;
      return route.fulfill({ status: 201, json: { category: added } });
    }
    if (created) await held;
    return route.fulfill({ json: { categories: things, counts: [] } });
  });
  await page.goto(`/studio/${workspace.id}/categories`);
  await expect(page.getByRole('button', { name: 'Parent', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add a thing', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a thing', exact: true });
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill('New thing');
  await dialog.getByRole('button', { name: 'Add thing', exact: true }).click();
  await expect(dialog).toBeHidden();
  const refreshed = () =>
    page.waitForResponse(
      (response) => response.url().includes('/categories') && response.request().method() === 'GET',
    );
  return { release, refreshed };
}

test('a new thing takes focus when it arrives late, if nothing else has been done', async ({
  page,
}) => {
  const { release, refreshed } = await thingsWithSlowRefresh(page);
  const arrived = refreshed();
  release();
  await arrived;
  await expect(page.getByRole('button', { name: 'New thing', exact: true })).toBeFocused();
});

test('a new thing arriving late does not take focus from a search begun meanwhile', async ({
  page,
}) => {
  const { release, refreshed } = await thingsWithSlowRefresh(page);
  const search = page.getByRole('searchbox', { name: 'Search things' });
  await search.fill('Parent');
  const arrived = refreshed();
  release();
  await arrived;
  await expect(page.getByRole('button', { name: 'Parent', exact: true })).toBeVisible();
  // Clearing the search brings the new row into the table. It used to take
  // focus then, so the next letters typed went nowhere.
  await search.fill('');
  await expect(page.getByRole('button', { name: 'New thing', exact: true })).toBeVisible();
  await expect(search).toBeFocused();
  await page.keyboard.type('New');
  await expect(search).toHaveValue('New');
});

for (const filter of ['Inactive', 'a search'] as const)
  test(`a new catalog item hidden by ${filter} is found on its own page when its record closes`, async ({
    page,
  }) => {
    const items = Array.from({ length: 51 }, (_, n) =>
      item(n, `Item ${String(n).padStart(2, '0')}`),
    );
    await signedIn(page);
    await page.route('**/api/studio/*/categories**', (route) =>
      route.fulfill({ json: { categories: [] } }),
    );
    await page.route('**/api/studio/*/catalog**', async (route) => {
      if (route.request().method() === 'POST') {
        const created = item(99, route.request().postDataJSON().name);
        items.push(created);
        return route.fulfill({ status: 201, json: { item: created } });
      }
      return route.fulfill({ json: { items, usage: [] } });
    });
    await page.goto(`/studio/${workspace.id}/catalog`);
    await expect(page.getByRole('button', { name: 'Item 00', exact: true })).toBeVisible();
    if (filter === 'Inactive')
      await page
        .getByRole('group', { name: 'Status' })
        .getByRole('button', { name: /^Inactive/ })
        .click();
    else await page.getByRole('searchbox', { name: 'Search catalog' }).fill('zzzz');

    await page.getByRole('button', { name: 'New catalog item', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create catalog item', exact: true });
    await dialog.getByRole('textbox', { name: 'Item name', exact: true }).fill('Z new item');
    await dialog.getByRole('button', { name: 'Create item', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Z new item', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Sorted last of 52, so the table has turned to page three for it.
    await expect(page.getByRole('button', { name: 'Z new item', exact: true })).toBeFocused();
    await expect(page.getByText('Showing 51–52 of 52 items', { exact: true })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search catalog' })).toHaveValue('');
  });
