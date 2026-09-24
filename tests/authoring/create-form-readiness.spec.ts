import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../../scripts/local-config.mjs';

const credentials = readConfig();
const workspace = 'workshop';
const headers = { Origin: 'http://127.0.0.1:3101' };

for (const outcome of ['available', 'unavailable'] as const) {
  test(`new guide keeps its form stable while work types are ${outcome}`, async ({ page }) => {
    const login = await page.request.post('/api/auth/sign-in/email', {
      headers,
      data: {
        email: credentials.GUIDE_LOCAL_OWNER_EMAIL,
        password: credentials.GUIDE_LOCAL_OWNER_PASSWORD,
      },
    });
    expect(login.status()).toBe(200);
    const name = `Model ${randomUUID().slice(0, 7)}`;
    const created = await page.request.post(`/api/studio/${workspace}/categories`, {
      headers,
      data: { name, domain: 'guide', parentId: null, visibility: 'members', description: '' },
    });
    expect(created.status()).toBe(201);

    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    await page.route(`**/api/studio/${workspace}/guide-types`, async (route) => {
      started();
      await held;
      if (outcome === 'unavailable') {
        await route.fulfill({
          status: 503,
          json: { error: { message: 'Temporarily unavailable.' } },
        });
      } else {
        await route.continue();
      }
    });
    try {
      await page.goto(`/studio/${workspace}/new`);
      await requestStarted;
      await expect(page.getByRole('status')).toHaveText('Loading guide options…');
      await expect(page.getByRole('textbox', { name: 'Guide title', exact: true })).toHaveCount(0);
    } finally {
      release();
    }
    const title = page.getByRole('textbox', { name: 'Guide title', exact: true });
    await title.fill('Choose the right model');
    await page.getByRole('textbox', { name: 'Summary', exact: true }).fill('Keep these details.');
    if (outcome === 'available') {
      await expect(page.getByRole('group', { name: 'What kind of work is this?' })).toBeVisible();
    } else {
      await expect(page.getByRole('group', { name: 'What kind of work is this?' })).toHaveCount(0);
    }
    const trigger = page.getByRole('button', { name: /^What is this about/ });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'Choose what is this about?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name, exact: true }).click();
    await expect(trigger).toContainText(name);
    if (outcome === 'unavailable') {
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Guide types could not be loaded',
      );
      await page.getByRole('button', { name: 'Retry guide types' }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText(
        'Guide types could not be loaded',
      );
      await expect(trigger).toContainText(name);
      await expect(page.getByRole('button', { name: 'Retry guide types' })).toBeFocused();
      await page.unroute(`**/api/studio/${workspace}/guide-types`);
      await page.getByRole('button', { name: 'Retry guide types' }).click();
      await expect(page.getByRole('group', { name: 'What kind of work is this?' })).toBeVisible();
      await expect(title).toBeFocused();
      await expect(trigger).toContainText(name);
    }
    await expect(title).toHaveValue('Choose the right model');
    await expect(page.getByRole('textbox', { name: 'Summary', exact: true })).toHaveValue(
      'Keep these details.',
    );
  });
}
