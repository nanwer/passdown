import { pressTab } from '../support/browser';
import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/studio/*/catalog**', (route) => route.fulfill({ json: { items: [] } }));
  const category = {
    id: '55555555-5555-4555-8555-555555555555',
    workspaceId: '22222222-2222-4222-8222-222222222222',
    domain: 'guide',
    parentId: null,
    name: 'Testing',
    code: 'GC-0001',
    description: '',
    visibility: 'public',
    archived: false,
    version: 1,
    sortOrder: 0,
    imageAssetId: null,
    path: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Testing' }],
  };
  const counts = {
    categoryId: category.id,
    direct: 0,
    subtree: 0,
    publishedDirect: 0,
    publishedSubtree: 0,
  };
  await page.route('**/api/studio/*/categories**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(`/${category.id}`))
      return route.fulfill({
        json: {
          category,
          counts,
          blockers: { activeChildren: 0, assignedGuides: 0, currentReleases: 0, activeItems: 0 },
        },
      });
    return route.fulfill({
      json: {
        categories: [category],
        ...(url.searchParams.has('page') && {
          counts: [counts],
          rows: [{ category, depth: 0, context: false, hasChildren: false, expanded: false }],
          total: 1,
          page: 1,
          pageSize: 25,
          statusCounts: { all: 1, active: 1, inactive: 0 },
        }),
      },
    });
  });
});
// Synthetic route fixtures verify client interactions only. Real persistence/auth
// are independently exercised by the local integration journey.
const workspace = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Interaction test workspace',
  audience: 'public',
  isRoot: true,
  role: 'manage',
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
  state: 'draft',
  publicationRevision: 0,
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
for (const backwards of [false, true]) {
  test(`explicit Option+${backwards ? 'Shift+' : ''}Tab wraps at the dialog boundary on every platform`, async ({
    page,
  }) => {
    await page.route('**/api/studio/session', (route) =>
      route.fulfill({
        json: {
          user: { id: 'user', name: 'Test owner', email: 'owner@test.local' },
          workspaces: [workspace],
        },
      }),
    );
    await page.goto(`/studio/${workspace.id}/categories`);
    await page.getByRole('button', { name: 'Testing', exact: true }).click();
    await page.getByRole('button', { name: 'Edit or move', exact: true }).click();
    await page.getByRole('button', { name: /^Sits inside/ }).click();
    const dialog = page.getByRole('dialog', { name: /Choose sits inside/i });
    const first = dialog.getByRole('textbox', { name: 'Search things' });
    const last = dialog.getByRole('button', { name: 'Close dialog' });
    await (backwards ? first : last).focus();
    // Deliberately bypass the platform helper: Linux CI must send Option too.
    await page.keyboard.press(backwards ? 'Alt+Shift+Tab' : 'Alt+Tab');
    await expect(backwards ? last : first).toBeFocused();
  });
}
for (const retainParentEscapeListener of [false, true]) {
  test(`a nested dialog shields its parent and restores the unfinished form${retainParentEscapeListener ? ' with a retained parent Escape listener' : ''}`, async ({
    page,
  }) => {
    // This used to run through the item-category picker inside the catalog form.
    // Items no longer belong to a tree, so it now runs through the one nesting
    // that remains: editing a thing opens a dialog, and the "Sits inside" picker
    // inside it opens another.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.route('**/api/studio/session', (route) =>
      route.fulfill({
        json: {
          user: { id: 'user', name: 'Test owner', email: 'owner@test.local' },
          workspaces: [workspace],
        },
      }),
    );
    await page.goto(`/studio/${workspace.id}/categories`);
    await page.getByRole('button', { name: 'Testing', exact: true }).click();
    // The thing opens in a sheet, and editing it opens a dialog over that.
    await page.getByRole('button', { name: 'Edit or move', exact: true }).click();

    const parent = page.getByRole('dialog', { name: 'Edit thing', exact: true });
    await expect(parent).toBeVisible();
    const parentBounds = (await parent.boundingBox())!;
    const name = parent.getByRole('textbox', { name: 'Name', exact: true });
    await name.fill('Keep this draft name');

    if (retainParentEscapeListener) {
      // Reproduce the observed Radix registration race deterministically: keep
      // the parent's native Escape listener while the nested portal mounts.
      // Tab and focus handlers are unchanged. The context is discarded per test.
      await page.evaluate(() => {
        const add = document.addEventListener.bind(document);
        const remove = document.removeEventListener.bind(document);
        document.addEventListener = (...args: Parameters<typeof document.addEventListener>) => {
          if (args[0] !== 'keydown') add(...args);
        };
        document.removeEventListener = (
          ...args: Parameters<typeof document.removeEventListener>
        ) => {
          if (args[0] !== 'keydown') remove(...args);
        };
      });
    }
    const inside = page.getByRole('button', { name: /^Sits inside/ });
    await inside.click();
    // While a child is open the parent is marked aria-hidden, so it stops being
    // exposed as a dialog. Identify the child by its own heading rather than by
    // counting.
    const child = page.getByRole('dialog', { name: /Choose sits inside/i });
    await expect(child).toBeVisible();

    // The backdrop must cover the exposed parent surface, not sit behind it.
    const exposedParent = { x: parentBounds.x + 30, y: parentBounds.y + 30 };
    expect(
      await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('dialog-overlay'),
        exposedParent,
      ),
    ).toBe(true);

    const search = child.getByRole('textbox', { name: 'Search things' });
    const root = child.getByRole('button', { name: 'Not inside anything', exact: true });
    const close = child.getByRole('button', { name: 'Close dialog' });
    await expect(search).toBeFocused();
    for (const control of [root, close, search, root, close, search]) {
      await pressTab(page);
      await expect(control).toBeFocused();
    }
    for (const control of [close, root, search]) {
      await pressTab(page, { shift: true });
      await expect(control).toBeFocused();
    }

    await page.keyboard.press('Escape');
    await expect(child).toHaveCount(0);
    // The parent is still there, still holding what was typed into it, and focus
    // is back where it came from.
    await expect(parent).toBeVisible();
    await expect(parent).not.toHaveAttribute('aria-hidden', 'true');
    await expect(inside).toBeFocused();
    await expect(name).toHaveValue('Keep this draft name');
  });
}
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
      json: {
        publicationRevision: 1,
        guide: { release: 1 },
        url: `/w/${workspace.id}/guides/${guideId}`,
      },
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
    expectedPublicationRevision: 0,
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
    return route.fulfill({
      json: { publicationRevision: 1, guide: { release: 1 }, url: `/guides/${guideId}` },
    });
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
