import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const origin = 'http://127.0.0.1:3106';
const owner = {
  name: 'Owner',
  email: 'Owner@Example.org',
  password: 'a long synthetic browser password',
  workspace: 'Workshop',
};

/** Light and dark, phone and desktop: readable, no sideways scrolling, no axe findings. */
async function checkLayouts(page: Page, name: string, ready: () => Promise<void>) {
  for (const theme of ['light', 'dark']) {
    await page.evaluate((t) => {
      document.documentElement.dataset.theme = t;
    }, theme);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await ready();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      if (process.env.SETUP_EVIDENCE_DIR && width !== 320)
        await page.screenshot({
          path: join(process.env.SETUP_EVIDENCE_DIR, `${name}-${theme}-${width}.png`),
          fullPage: true,
        });
    }
  }
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
}

test('sign in with the default login, finish setting up, and retire the default login', async ({
  page,
}) => {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  expect(await (await page.request.get('/api/health')).json()).toMatchObject({
    status: 'setup-required',
  });

  // A new installation's front page leads to signing in.
  await page.goto('/');
  await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fstudio$/);
  const hint = page.getByText('First time? Sign in with admin@example.com and changeme.');
  await checkLayouts(page, 'sign-in-hint', () => expect(hint).toBeVisible());

  // Keyboard only, at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
  await page.keyboard.type('admin@example.com');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await page.keyboard.type('changeme');
  await page.keyboard.press('Enter');

  const heading = page.getByRole('heading', { name: 'Finish setting up Passdown' });
  await expect(heading).toBeVisible();
  await expect(page).toHaveURL('/studio');
  await expect(page.getByLabel('Your name')).toBeFocused();
  await page.setViewportSize({ width: 1280, height: 900 });
  await checkLayouts(page, 'finish-setting-up', () => expect(heading).toBeVisible());

  // Nothing else is reachable: pages show the same form, and the API refuses.
  for (const path of ['/account', '/admin/accounts', '/studio/warm-up']) {
    await page.goto(path);
    await expect(heading).toBeVisible();
    await expect(page.getByRole('link', { name: /^(Studio|Administration)$/ })).toHaveCount(0);
  }
  const session = await page.request.get('/api/studio/session');
  expect([session.status(), (await session.json()).error.code]).toEqual([403, 'SETUP_REQUIRED']);
  const password = await page.request.post('/api/studio/password', {
    headers: { origin },
    data: { currentPassword: 'changeme', newPassword: 'a different long password' },
  });
  expect(password.status()).toBe(422);
  expect((await password.json()).error.message).toContain('finish setting up');
  const foreign = await page.request.post('/api/setup', {
    headers: { origin: 'https://attacker.example' },
    data: {},
  });
  expect(foreign.status()).toBe(403);
  expect((await foreign.json()).error.message).toContain(`Passdown is set up for ${origin}`);

  // Refusals keep what was typed and focus the field to fix, at phone width.
  await page.goto('/studio');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Your name')).toBeFocused();
  await page.keyboard.type(owner.name);
  await page.keyboard.press('Tab');
  await page.keyboard.type('admin@example.com');
  await page.keyboard.press('Tab');
  await page.keyboard.type(owner.password);
  await page.keyboard.press('Tab');
  await page.keyboard.type('a mismatched long password');
  await page.keyboard.press('Tab');
  await page.keyboard.type(owner.workspace);
  await page.keyboard.press('Enter');
  const email = page.getByLabel('Your email address');
  await expect(email).toBeFocused();
  await expect(email).toHaveAccessibleDescription(
    'Use your own email address, not admin@example.com.',
  );
  await email.fill(owner.email);
  await page.keyboard.press('Enter');
  const again = page.getByLabel('New password again');
  await expect(again).toBeFocused();
  await again.fill(owner.password);
  const submitted = page.waitForResponse(
    (response) => response.url().endsWith('/api/setup') && response.request().method() === 'POST',
  );
  await page.keyboard.press('Enter');
  expect((await submitted).status()).toBe(201);

  // A single-workspace installation opens that workspace.
  await expect(page).toHaveURL('/studio/workshop');
  await expect(heading).toHaveCount(0);
  expect(await (await page.request.get('/api/health')).json()).toMatchObject({ status: 'ready' });
  expect((await page.request.get('/api/studio/session')).status()).toBe(200);
  await page.goto('/setup');
  await expect(page).toHaveURL('/studio/workshop');
  expect(urls.some((url) => url.includes('synthetic') || url.includes('changeme'))).toBe(false);

  // The default login is gone, and the sign-in page no longer offers it.
  await page.context().clearCookies();
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { name: 'Sign in to your studio' })).toBeVisible();
  await expect(hint).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill('admin@example.com');
  await page.getByLabel('Password', { exact: true }).fill('changeme');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.getByLabel('Email', { exact: true }).fill(owner.email);
  await page.getByLabel('Password', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/studio/);
  await expect(heading).toHaveCount(0);
});
