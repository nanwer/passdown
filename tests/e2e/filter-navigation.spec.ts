import { expect, test, type Page } from '@playwright/test';

async function scrollToFilters(page: Page) {
  await page.locator('.category-tabs').evaluate((element) => {
    window.scrollTo({
      top: window.scrollY + element.getBoundingClientRect().top - 120,
      behavior: 'instant',
    });
  });
  return page.evaluate(() => ({ origin: performance.timeOrigin, scroll: window.scrollY }));
}

for (const viewport of [
  { width: 1440, height: 1100 },
  { width: 390, height: 844 },
]) {
  for (const workspace of [
    {
      path: '/',
      filters: [
        ['Bicycles', 1],
        ['Home & living', 2],
        ['Electronics', 3],
        ['All guides', 6],
      ] as const,
    },
    {
      path: '/preview/workshop',
      filters: [
        ['Inspection', 1],
        ['Workshop routines', 1],
        ['All guides', 2],
      ] as const,
    },
  ]) {
    test(`${viewport.width}px category changes stay in place on ${workspace.path}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(() => localStorage.setItem('guide-theme', 'light'));
      await page.goto(workspace.path);
      // A real interaction confirms hydration before testing in-place navigation.
      await page.getByRole('button', { name: 'Switch to dark theme' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      for (const [label, count] of workspace.filters) {
        const before = await scrollToFilters(page);
        await page
          .getByRole('navigation', { name: 'Guide things' })
          .getByRole('link', { name: label, exact: true })
          .click();
        await expect(page.locator('.guide-card')).toHaveCount(count);
        await expect(
          page
            .getByRole('navigation', { name: 'Guide things' })
            .getByRole('link', { name: label, exact: true }),
        ).toHaveAttribute('aria-current', 'true');
        await expect(page.getByRole('status')).toHaveText(
          `${count} ${count === 1 ? 'guide' : 'guides'} found.`,
        );
        expect(
          await page.evaluate(() => performance.timeOrigin),
          'Filtering must not replace the document',
        ).toBe(before.origin);
        await expect
          .poll(() => page.evaluate((before) => Math.abs(window.scrollY - before), before.scroll), {
            message: 'Filtering must preserve the visible position',
          })
          .toBeLessThanOrEqual(1);
      }
    });
  }
}

test('search, no-results recovery and Back/Forward preserve the document and filters', async ({
  page,
}) => {
  await page.goto('/categories/electronics');
  // Keep the submit button below the sticky header so clicking it does not
  // itself require the browser to scroll it into view.
  await page.locator('.search-form').evaluate((element) => {
    window.scrollTo({
      top: window.scrollY + element.getBoundingClientRect().top - 200,
      behavior: 'instant',
    });
  });
  const before = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    scroll: window.scrollY,
  }));
  await page.getByRole('searchbox').fill('keyboard');
  await page.getByRole('button', { name: 'Search guides' }).click();
  await expect(page.locator('.guide-card')).toHaveCount(1);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(before.origin);
  await expect
    .poll(() => page.evaluate((before) => Math.abs(window.scrollY - before), before.scroll))
    .toBeLessThanOrEqual(1);
  expect(new URL(page.url()).pathname).toBe('/categories/electronics');
  await page.getByRole('searchbox').fill('no-such-guide');
  await page.getByRole('searchbox').press('Enter');
  await expect(page.getByRole('heading', { name: 'No guides found' })).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expect(page.locator('.guide-card')).toHaveCount(6);
  await expect(page.getByRole('searchbox')).toHaveValue('');
  await expect(page.getByRole('link', { name: 'All guides', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(before.origin);
  await page.goBack();
  await expect(page.getByRole('searchbox')).toHaveValue('no-such-guide');
  await expect(page.getByRole('link', { name: 'Electronics', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(page.getByRole('heading', { name: 'No guides found' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('searchbox')).toHaveValue('keyboard');
  await expect(page.locator('.guide-card')).toHaveCount(1);
  await page.goForward();
  await expect(page.getByRole('searchbox')).toHaveValue('no-such-guide');
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(before.origin);
});

test('a delayed workshop category response updates in place when it arrives', async ({ page }) => {
  let release!: () => void;
  const responseGate = new Promise<void>((resolve) => (release = resolve));
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => (markRequested = resolve));
  await page.route('**/preview/workshop/categories/inspection*', async (route) => {
    markRequested();
    await responseGate;
    await route.continue();
  });
  await page.addInitScript(() => localStorage.setItem('guide-theme', 'light'));
  await page.goto('/preview/workshop');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const before = await scrollToFilters(page);
  const inspection = page
    .getByRole('navigation', { name: 'Guide things' })
    .getByRole('link', { name: 'Inspection', exact: true });

  try {
    await inspection.click();
    await requested;
    // Results from the previous route remain usable until the new response is
    // ready. An unchanged count during this interval is not a failed filter.
    await expect(page.locator('.guide-card')).toHaveCount(2);
    release();
    await expect(page).toHaveURL(/\/preview\/workshop\/categories\/inspection$/);
    await expect(page.locator('.guide-card')).toHaveCount(1);
    await expect(inspection).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('status')).toHaveText('1 guide found.');
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(before.origin);
    await expect
      .poll(() => page.evaluate((before) => Math.abs(window.scrollY - before), before.scroll))
      .toBeLessThanOrEqual(1);
  } finally {
    release();
  }
});
