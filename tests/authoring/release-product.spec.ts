import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readConfig } from '../../scripts/local-config.mjs';
import { browserContextOptions } from '../support/browser';
const local = readConfig();
async function signIn(request: APIRequestContext, origin: string) {
  const response = await request.post('/api/auth/sign-in/email', {
    headers: { Origin: origin },
    data: {
      email: process.env.PASSDOWN_PRODUCT_ADMIN_EMAIL ?? local.GUIDE_LOCAL_OWNER_EMAIL,
      password: process.env.PASSDOWN_PRODUCT_ADMIN_PASSWORD ?? local.GUIDE_LOCAL_OWNER_PASSWORD,
    },
  });
  expect(response.status()).toBe(200);
  const session = await (await request.get('/api/studio/session')).json();
  expect(session.isAdministrator).toBe(true);
  return session.workspaces.find((w: { role: string }) => w.role === 'manage') as {
    id: string;
    name: string;
  };
}
async function json(request: APIRequestContext, origin: string, path: string, data: unknown) {
  const response = await request.post(path, { headers: { Origin: origin }, data });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
test('withdraws and reinstates while preserving unsaved instructions and hiding the reader content', async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = baseURL!;
  const workspace = await signIn(page.request, origin);
  const category = await json(page.request, origin, `/api/studio/${workspace.id}/categories`, {
    domain: 'guide',
    parentId: null,
    name: `Withdrawal ${randomUUID().slice(0, 8)}`,
    description: 'Synthetic browser verification',
    visibility: 'public',
    sortOrder: 0,
  });
  const title = `Withdraw browser ${randomUUID().slice(0, 8)}`;
  const created = await json(page.request, origin, `/api/studio/${workspace.id}/guides`, {
    audience: 'public',
    categoryId: category.category.id,
    document: {
      schemaVersion: 1,
      title,
      summary: 'Synthetic withdrawal verification',
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
              children: [{ type: 'text', text: 'Original published instructions.', marks: [] }],
            },
          ],
          media: [],
          callouts: [],
        },
      ],
    },
  });
  const endpoint = `/api/studio/${workspace.id}/guides/${created.guide.id}`;
  const published = await json(page.request, origin, `${endpoint}/publish`, {
    expectedVersion: created.guide.version,
    expectedRelease: null,
    expectedPublicationRevision: created.guide.publicationRevision,
    license: 'CC-BY-4.0',
  });
  await page.goto(`/studio/${workspace.id}/${created.guide.id}`);
  const instructions = page.getByRole('textbox', { name: 'Instructions', exact: true });
  await instructions.fill('Unsaved instructions must survive.');
  await page.getByRole('button', { name: 'Withdraw…', exact: true }).click();
  await page.getByLabel('Reason (optional)').fill('Synthetic withdrawal');
  await page.getByRole('button', { name: 'Withdraw release 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reinstate…', exact: true })).toBeVisible();
  await expect(instructions).toHaveText('Unsaved instructions must survive.');
  const visitor = await browser.newContext({ ...browserContextOptions, baseURL: origin });
  try {
    const reader = await visitor.newPage();
    await reader.goto(published.url);
    await expect(
      reader.getByRole('heading', { name: 'This guide has been withdrawn' }),
    ).toBeVisible();
    await expect(reader.getByText(title, { exact: true })).toHaveCount(0);
    await expect(reader.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await page.getByRole('button', { name: 'Reinstate…', exact: true }).click();
    await page.getByRole('button', { name: 'Reinstate release 1', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Withdraw…', exact: true })).toBeVisible();
    await expect(instructions).toHaveText('Unsaved instructions must survive.');
    await reader.reload();
    await expect(reader.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(
      reader.getByText('Original published instructions.', { exact: true }),
    ).toBeVisible();
  } finally {
    await visitor.close();
  }
});
test('an administrator cancels a link then a replacement resets an invited account', async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = baseURL!;
  const workspace = await signIn(page.request, origin);
  const suffix = randomUUID().slice(0, 8),
    name = `Recovery Reader ${suffix}`,
    email = `recovery-${suffix}@example.test`;
  const invitation = await json(page.request, origin, `/api/studio/${workspace.id}/people`, {
    email,
    role: 'view',
  });
  const receiver = await browser.newContext({ ...browserContextOptions, baseURL: origin });
  try {
    const guest = await receiver.newPage();
    await guest.goto(invitation.link);
    await guest.getByRole('textbox', { name: 'Your name', exact: true }).fill(name);
    await guest.getByLabel('Password', { exact: true }).fill('synthetic-original-password');
    await guest.getByLabel('Password again', { exact: true }).fill('synthetic-original-password');
    await guest.getByRole('button', { name: /^Join / }).click();
    await expect(guest).toHaveURL(new RegExp(`/studio/${workspace.id}$`));
    expect((await guest.request.get('/api/admin/accounts')).status()).toBe(404);
    await page.goto('/admin/accounts');
    await page.getByRole('searchbox', { name: 'Search accounts' }).fill(email);
    const create = page.getByRole('button', { name: `Create reset link for ${name}`, exact: true });
    await create.click();
    await page.getByRole('button', { name: 'Create link', exact: true }).click();
    const field = page.getByRole('textbox', { name: `Reset link for ${name}`, exact: true });
    const cancelled = await field.inputValue();
    await page.getByRole('button', { name: 'Cancel this link', exact: true }).click();
    await expect(
      page.getByText('Link cancelled. It no longer works.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await guest.goto(cancelled);
    await expect(
      guest.getByRole('heading', { name: 'This reset link is no longer valid.' }),
    ).toBeVisible();
    await create.click();
    await page.getByRole('button', { name: 'Create link', exact: true }).click();
    const usable = await field.inputValue();
    await guest.goto(usable);
    await guest.getByLabel('New password', { exact: true }).fill('synthetic-replacement-password');
    await guest
      .getByLabel('New password again', { exact: true })
      .fill('synthetic-replacement-password');
    await guest.getByRole('button', { name: 'Set password and sign in', exact: true }).click();
    await expect(guest).toHaveURL(/\/studio(?:\/[^/]+)?$/);
    expect(
      (
        await guest.request.get(
          new URL(usable).pathname.replace('/reset/', '/api/password-resets/'),
        )
      ).status(),
    ).toBe(404);
    await guest.goto('/account');
    for (const [current, next] of [
      ['synthetic-replacement-password', 'synthetic-second-password'],
      ['synthetic-second-password', 'synthetic-third-password'],
    ]) {
      await guest.getByLabel('Current password', { exact: true }).fill(current!);
      await guest.getByLabel('New password', { exact: true }).fill(next!);
      await guest.getByLabel('New password again', { exact: true }).fill(next!);
      await guest.getByRole('button', { name: 'Change password', exact: true }).click();
      await expect(
        guest.getByText('Password changed. You are still signed in here.', { exact: true }),
      ).toBeVisible();
      await expect(guest.getByLabel('Current password', { exact: true })).toHaveValue('');
    }
  } finally {
    await receiver.close();
  }
});
