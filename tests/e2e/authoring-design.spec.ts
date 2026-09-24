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

test('switching a guide to public explains a private selection without losing it', async ({
  page,
}) => {
  const category = {
    id: '88888888-8888-4888-8888-888888888888',
    workspaceId: workspace.id,
    domain: 'guide',
    parentId: null,
    name: 'Workshop machinery',
    description: '',
    visibility: 'members',
    archived: false,
    version: 1,
    sortOrder: 0,
    path: [{ id: '88888888-8888-4888-8888-888888888888', name: 'Workshop machinery' }],
  };
  await page.route('**/api/studio/*/categories**', (route) =>
    route.fulfill({ json: { categories: [category] } }),
  );
  await page.getByRole('radio', { name: /Internal/ }).check();
  const picker = page.getByRole('button', { name: /What is this about/ });
  await picker.click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Workshop machinery/ })
    .click();
  const liveRegion = picker.locator('..').getByRole('status');
  await expect(liveRegion).toBeAttached();
  await expect(liveRegion).toBeEmpty();
  const liveNode = await liveRegion.elementHandle();
  await page.getByRole('radio', { name: /Public/ }).check();
  expect(await liveNode!.evaluate((node) => node.isConnected)).toBe(true);
  const warning = page
    .getByRole('status')
    .filter({ hasText: 'Only workspace members can see Workshop machinery.' });
  await expect(warning).toBeVisible();
  await expect(picker).toHaveAttribute(
    'aria-describedby',
    (await warning.getAttribute('id')) ?? 'missing',
  );
  await expect(picker).toContainText('Workshop machinery');
  await page.getByRole('radio', { name: /Internal/ }).check();
  await expect(warning).toBeHidden();
  await expect(picker).toContainText('Workshop machinery');
});

for (const width of [390, 1440]) {
  for (const initialRole of ['keep', 'use'] as const) {
    test(`${width}px: changing ${initialRole} usage keeps the item, focus and open notes in place`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page
        .getByRole('button', {
          name: initialRole === 'keep' ? 'Add something you keep' : 'Add something you use up',
          exact: true,
        })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /Precision driver/ })
        .click();
      await page.getByRole('button', { name: 'Guide-specific notes', exact: true }).click();
      const role = page.getByRole('combobox', {
        name: 'Precision driver: After this guide',
        exact: true,
      });
      await role.scrollIntoViewIfNeeded();
      await role.focus();
      const before = (await role.boundingBox())!;
      await role.selectOption(initialRole === 'keep' ? 'use' : 'keep');
      const after = (await role.boundingBox())!;
      // Regrouping on change remounts the select, loses disclosure state and
      // shifts the control. This checks the visible experience, not CSS names.
      expect({
        value: await role.inputValue(),
        focused: await role.evaluate((element) => element === document.activeElement),
        notesOpen: await page
          .getByRole('textbox', { name: 'Guide-specific notes', exact: true })
          .isVisible(),
        verticalMovement: Math.round(after.y - before.y),
      }).toEqual({
        value: initialRole === 'keep' ? 'use' : 'keep',
        focused: true,
        notesOpen: true,
        verticalMovement: 0,
      });
    });
  }
}
