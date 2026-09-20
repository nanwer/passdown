import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../../scripts/local-config.mjs';
const credentials = readConfig();
const origin = 'http://127.0.0.1:3101';
const headers = { Origin: origin };
const out = '/tmp/passdown-ux';

test('capture the current authoring experience', async ({ page }) => {
  // Signed in through the API, never by typing into the form.
  const signIn = await page.request.post('/api/auth/sign-in/email', {
    headers,
    data: {
      email: credentials.GUIDE_LOCAL_OWNER_EMAIL,
      password: credentials.GUIDE_LOCAL_OWNER_PASSWORD,
    },
  });
  expect(signIn.status()).toBe(200);
  const shot = async (name: string, full = true) => {
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: full });
  };

  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto('/');
  await shot('01-public-library');

  await page.goto('/studio/repair-collective/new');
  await shot('02-new-guide');

  await page.goto('/studio/repair-collective/categories');
  await shot('03-categories-list');

  const addCategory = page
    .getByRole('button', { name: /New category|Add category|Create category/ })
    .first();
  if (await addCategory.count()) {
    await addCategory.click();
    await page.waitForTimeout(400);
    await shot('04-create-category-modal', false);
    const parent = page.getByRole('button', { name: /Parent/ }).first();
    if (await parent.count()) {
      await parent.click();
      await page.waitForTimeout(400);
      await shot('05-parent-picker', false);
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Escape');
  }

  await page.goto('/studio/repair-collective/catalog');
  await shot('06-catalog');

  const addItem = page.getByRole('button', { name: /Add tool|New item|Add item/ }).first();
  if (await addItem.count()) {
    await addItem.click();
    await page.waitForTimeout(500);
    await shot('07-add-catalog-item', false);
  }

  await page.goto('/studio/repair-collective');
  await shot('08-studio-home');
});
