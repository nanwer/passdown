import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('complete a new installation, recover invalid inputs, and close setup forever', async ({
  page,
  request,
}) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  expect((await request.get('/api/health')).ok()).toBe(true);
  await page.goto('/studio');
  await expect(page.getByRole('heading', { name: 'Set up Passdown' })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByLabel('Setup code')).toHaveCSS(
        'color',
        theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(24, 24, 25)',
      );
      await expect(page.getByRole('button', { name: 'Create installation' })).toHaveCSS(
        'background-color',
        theme === 'dark' ? 'rgb(69, 145, 247)' : 'rgb(0, 100, 224)',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      if (process.env.SETUP_EVIDENCE_DIR)
        await page.screenshot({
          path: join(process.env.SETUP_EVIDENCE_DIR, `setup-${theme}-${width}.png`),
          fullPage: true,
        });
    }
  }
  await page.getByLabel('Setup code').fill('wrong');
  await page.getByLabel('Your name').fill('Owner');
  await page.getByLabel('Email', { exact: true }).fill('Owner@Example.org');
  await page.getByLabel('Password', { exact: true }).fill('a long synthetic browser password');
  await page.getByLabel('Confirm password').fill('mismatched password');
  await page.getByLabel('Workspace name').fill('Workshop');
  await page.getByRole('button', { name: 'Create installation' }).click();
  await expect(page.getByLabel('Confirm password')).toBeFocused();
  await page.getByLabel('Confirm password').fill('a long synthetic browser password');
  await page.getByRole('button', { name: 'Create installation' }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    "That setup code isn't right",
  );
  await expect(page.getByLabel('Setup code')).toBeFocused();
  const crossOrigin = await request.post('/api/setup', {
    headers: { origin: 'https://attacker.example' },
    data: {},
  });
  expect(crossOrigin.status()).toBe(403);
  // Saturate the shared bucket through real requests, then finish with the
  // correct code. The operator must not be locked out by incorrect guesses.
  const failures = [];
  for (let attempt = 0; attempt < 31; attempt++) {
    const response = await request.post('/api/setup', {
      headers: { origin: 'http://127.0.0.1:3106' },
      data: {
        code: 'wrong',
        name: 'Owner',
        email: 'owner@example.org',
        password: 'a long synthetic browser password',
        workspaceName: 'Workshop',
      },
    });
    failures.push(response.status());
  }
  await page.getByLabel('Setup code').fill('12345-67890-ABCDE-FGHJK');
  const submitted = page.waitForResponse(
    (response) => response.url().endsWith('/api/setup') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Create installation' }).click();
  expect({ rateLimited: failures.includes(429), submitted: (await submitted).status() }).toEqual({
    rateLimited: true,
    submitted: 201,
  });
  // A single-workspace installation redirects to that workspace immediately.
  await expect(page).toHaveURL('/studio/workshop');
  await expect(page.getByRole('heading', { name: 'Set up Passdown' })).toHaveCount(0);
  expect((await request.get('/api/health')).ok()).toBe(true);
  expect((await request.get('/setup')).status()).toBe(404);
  expect(
    (
      await request.post('/api/setup', { headers: { origin: 'http://127.0.0.1:3106' }, data: {} })
    ).status(),
  ).toBe(404);
  expect(urls.some((url) => url.includes('12345') || url.includes('synthetic'))).toBe(false);
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await page.getByLabel('Email', { exact: true }).fill('Owner@Example.org');
  await page.getByLabel('Password', { exact: true }).fill('a long synthetic browser password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/studio/);
});
