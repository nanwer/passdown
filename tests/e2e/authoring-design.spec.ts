import { test, expect } from '@playwright/test';
import { defaultGuideTypes } from '../../packages/guide-content/src';

// Visual control regressions use synthetic responses; persistence is covered
// by the authoring suite against its disposable database.
const workspace = {
  id: 'workshop',
  name: 'Workshop',
  audience: 'public',
  isRoot: true,
  role: 'manage',
};
const item = {
  id: '77777777-7777-4777-8777-777777777777',
  workspaceId: workspace.id,
  name: 'Precision driver',
  specification: 'Phillips #00',
  description: '',
  manufacturer: '',
  model: '',
  partNumber: '',
  defaultUnit: 'each',
  visibility: 'public',
  archived: false,
  version: 1,
};
test.beforeEach(async ({ page }) => {
  await page.route('**/api/studio/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'owner', name: 'Owner', email: 'owner@test.local' },
        workspaces: [workspace],
      },
    }),
  );
  await page.route('**/api/studio/*/guide-types', (route) =>
    route.fulfill({ json: { types: defaultGuideTypes, composeTitles: true } }),
  );
  await page.route('**/api/studio/*/catalog**', (route) =>
    route.fulfill({ json: { items: [item] } }),
  );
  await page.route('**/api/studio/*/categories**', (route) =>
    route.fulfill({ json: { categories: [] } }),
  );
  await page.goto('/studio/workshop/new');
});

test('choice indicators keep their own size instead of inheriting text-field dimensions', async ({
  page,
}) => {
  const radio = page.getByRole('radio', { name: /Inspection/ });
  await radio.waitFor();
  const box = (await radio.boundingBox())!;
  expect(Math.max(box.width, box.height)).toBeLessThanOrEqual(24);
});

test('empty preparation notes do not compete with quantity controls', async ({ page }) => {
  await page.getByRole('button', { name: 'Add something you keep', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Precision driver/ })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Guide-specific notes', exact: true }),
  ).toBeHidden();
});

test('internal guides can choose member-only catalog items in a public workspace', async ({
  page,
}) => {
  await page.route('**/api/studio/*/catalog**', (route) =>
    route.fulfill({ json: { items: [{ ...item, visibility: 'members' }] } }),
  );
  await page.getByRole('radio', { name: /Internal/ }).check();
  await page.getByRole('button', { name: 'Add something you keep', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: /Precision driver/ }),
  ).toBeVisible();
});
