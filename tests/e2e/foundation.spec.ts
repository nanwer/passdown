import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('library filters and reader navigation use the same public records', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Good knowledge. Put to work.' })).toBeVisible();
  await expect(page.locator('.guide-card')).toHaveCount(6);
  await page.getByRole('link', { name: 'Electronics', exact: true }).click();
  await expect(page.locator('.guide-card')).toHaveCount(3);
  await page.getByRole('searchbox').fill('keyboard');
  await page.getByRole('button', { name: 'Search guides' }).click();
  await expect(page.locator('.guide-card')).toHaveCount(1);
  await page.getByRole('heading', { name: 'Inside a mechanical keyboard' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inside a mechanical keyboard' }),
  ).toBeVisible();
  await page.getByRole('link', { name: '03 Inspect the contact points' }).click();
  await expect(page).toHaveURL(/#step-/);
});
test('anonymous routes conceal private and unpublished records', async ({ request }) => {
  for (const url of [
    '/w/workshop',
    '/guides/private-note',
    '/guides/unpublished-sample',
    '/guides/withdrawn-sample',
    '/api/v1/workspaces/workshop/guides?actor=demo-reader',
  ]) {
    expect((await request.get(url)).status(), url).toBe(404);
  }
  const response = await request.get('/api/v1/workspaces/repair-collective/guides');
  const body = await response.json();
  expect(body.guides).toHaveLength(6);
  expect(JSON.stringify(body)).not.toContain('Members-only');
  expect(response.headers()['cache-control']).toContain('no-store');
});
test('team preview is clearly synthetic and reuses the reader', async ({ page }) => {
  await page.goto('/preview/workshop');
  await expect(page.locator('.preview-banner')).toBeVisible();
  await expect(page.locator('.guide-card')).toHaveCount(2);
  await page.getByRole('heading', { name: 'Prepare a shared workbench' }).click();
  await expect(page.locator('.reader-step')).toHaveCount(5);
});
test('theme persists and dialog restores focus after Escape', async ({ page }) => {
  await page.goto('/components');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const trigger = page.getByRole('button', { name: 'Open example dialog' });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab');
    expect(
      await page.getByRole('dialog').evaluate((dialog) => dialog.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
for (const theme of ['light', 'dark']) {
  test(`library and reader have no detected axe violations in ${theme}`, async ({ page }) => {
    await page.addInitScript((value) => localStorage.setItem('guide-theme', value), theme);
    for (const url of ['/', '/guides/bicycle-brake', '/components', '/preview/workshop']) {
      await page.goto(url);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    }
  });
}
test('mobile library and reader fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ['/', '/guides/bicycle-brake', '/components']) {
    await page.goto(url);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});

test('the read API rejects oversized search input with a traceable error', async ({ request }) => {
  const response = await request.get(
    '/api/v1/workspaces/repair-collective/guides?q=' + 'a'.repeat(201),
  );
  expect(response.status()).toBe(422);
  const body = await response.json();
  expect(body.error.code).toBe('INVALID_QUERY');
  expect(body.error.requestId).toBe(response.headers()['x-request-id']);
});
