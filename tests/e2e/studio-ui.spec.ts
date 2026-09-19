import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/studio/*/catalog**', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/studio/*/categories**', (route) =>
    route.fulfill({
      json: {
        categories: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            workspaceId: '22222222-2222-4222-8222-222222222222',
            domain: 'guide',
            parentId: null,
            name: 'Testing',
            description: '',
            visibility: 'public',
            archived: false,
            version: 1,
            sortOrder: 0,
            path: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Testing' }],
          },
        ],
      },
    }),
  );
});
// Synthetic route fixtures verify client interactions only. Real persistence/auth
// are independently exercised by the local integration journey.
const workspace = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Interaction test workspace',
  audience: 'public',
  role: 'owner',
};
const guideId = '33333333-3333-4333-8333-333333333333';
const initial = {
  id: guideId,
  workspaceId: workspace.id,
  title: 'Test instructions',
  summary: 'A fixture for editor behavior',
  category: 'Testing',
  categoryId: '55555555-5555-4555-8555-555555555555',
  categoryPath: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Testing' }],
  audience: 'public',
  version: 1,
  currentRelease: null,
  publishedVersion: null,
  updatedAt: '2026-09-19T12:00:00Z',
  stepCount: 1,
  document: {
    schemaVersion: 1,
    title: 'Test instructions',
    summary: 'A fixture for editor behavior',
    locale: 'en',
    difficulty: 'easy',
    durationMinutes: 15,
    tools: [],
    steps: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        title: 'First step',
        body: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Original instructions', marks: ['bold'] }],
          },
        ],
        media: [],
        callouts: [],
      },
    ],
  },
};
test('synthetic editor preserves typing during save, supports stable step operations and conflict recovery', async ({
  page,
}) => {
  let stored = structuredClone(initial);
  let conflict = false;
  let releaseSave: () => void = () => {};
  let held = false;
  await page.route('**/api/studio/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'user', name: 'Test owner', email: 'owner@test.local' },
        workspaces: [workspace],
      },
    }),
  );
  await page.route(`**/api/studio/${workspace.id}/guides/${guideId}`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { guide: stored } });
    if (conflict)
      return route.fulfill({
        status: 409,
        json: { error: { message: 'A newer draft exists.', code: 'CONFLICT' } },
      });
    const payload = route.request().postDataJSON();
    if (held)
      await new Promise<void>((resolve) => {
        releaseSave = resolve;
      });
    stored = { ...stored, ...payload, version: stored.version + 1 };
    await route.fulfill({ json: { guide: stored } });
  });
  await page.goto(`/studio/${workspace.id}/${guideId}`);
  await expect(page.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveText(
    'Original instructions',
  );
  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm publication' })).toBeDisabled();
  await page.getByLabel('Content license').selectOption('CC-BY-4.0');
  await expect(page.getByRole('button', { name: 'Confirm publication' })).toBeEnabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.getByRole('button', { name: 'Guide details' }).click();
  await page.getByLabel('Guide title', { exact: true }).fill('Changed metadata');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(stored.document.steps[0].body[0].children[0].marks).toEqual(['bold']);
  await page.getByRole('button', { name: '01 First step' }).click();
  await page.getByRole('textbox', { name: 'Instructions', exact: true }).fill('Save this text');
  held = true;
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Saving…')).toBeVisible();
  await page
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('New text typed during save');
  releaseSave();
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Instructions', exact: true })).toHaveText(
    'New text typed during save',
  );
  held = false;
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await expect(page.getByLabel('Step title', { exact: true })).toHaveValue('First step (copy)');
  await page.getByRole('button', { name: 'Move up', exact: true }).click();
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();
  expect(new Set(stored.document.steps.map((s) => s.id)).size).toBe(2);
  expect(stored.document.steps[0].title).toBe('First step (copy)');
  conflict = true;
  await page
    .getByRole('textbox', { name: 'Instructions', exact: true })
    .fill('Keep my conflicting text');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('Save conflict', { exact: true })).toBeVisible();
  await page.getByText('Show recovery text').click();
  await expect(page.getByLabel('Recovery draft JSON')).toHaveValue(/Keep my conflicting text/);
  await expect(page.getByRole('button', { name: 'Publish…', exact: true })).toBeDisabled();
});
test('synthetic private publication records reserved rights and mobile editor reflows', async ({
  page,
}) => {
  const privateWorkspace = { ...workspace, audience: 'private' };
  const privateGuide = { ...initial, audience: 'members' };
  let publication: unknown;
  await page.route('**/api/studio/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'u', name: 'Owner', email: 'test@example.com' },
        workspaces: [privateWorkspace],
      },
    }),
  );
  await page.route(`**/api/studio/${workspace.id}/guides/${guideId}`, (route) =>
    route.fulfill({ json: { guide: privateGuide } }),
  );
  await page.route(`**/api/studio/${workspace.id}/guides/${guideId}/publish`, (route) => {
    publication = route.request().postDataJSON();
    return route.fulfill({
      json: { guide: { release: 1 }, url: `/w/${workspace.id}/guides/${guideId}` },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/studio/${workspace.id}/${guideId}`);
  await expect(page.getByRole('textbox', { name: 'Instructions', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Read published guide' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read published guide' })).toBeFocused();
  expect(publication).toEqual({
    expectedVersion: 1,
    expectedRelease: null,
    license: 'all-rights-reserved',
  });
});

test('publication failure retains the dialog and license, then retry closes it and focuses the release', async ({
  page,
}) => {
  let attempts = 0;
  await page.route('**/api/studio/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'u', name: 'Owner', email: 'owner@test.local' },
        workspaces: [workspace],
      },
    }),
  );
  await page.route(`**/api/studio/${workspace.id}/guides/${guideId}`, (route) =>
    route.fulfill({ json: { guide: initial } }),
  );
  await page.route(`**/api/studio/${workspace.id}/guides/${guideId}/publish`, (route) => {
    attempts++;
    if (attempts === 1)
      return route.fulfill({
        status: 503,
        json: {
          error: {
            message: 'Publication is temporarily unavailable. Try again.',
            code: 'UNAVAILABLE',
          },
        },
      });
    return route.fulfill({ json: { guide: { release: 1 }, url: `/guides/${guideId}` } });
  });
  await page.goto(`/studio/${workspace.id}/${guideId}`);
  await page.getByRole('button', { name: 'Publish…', exact: true }).click();
  await page.getByLabel('Content license').selectOption('CC-BY-4.0');
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'temporarily unavailable',
  );
  await expect(page.getByLabel('Content license')).toHaveValue('CC-BY-4.0');
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Read published guide' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Publish…', exact: true })).toBeDisabled();
  expect(attempts).toBe(2);
});
