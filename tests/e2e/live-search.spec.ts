import { expect, test } from '@playwright/test';

test('typing filters the library without Enter and preserves the active category', async ({
  page,
}) => {
  await page.goto('/categories/electronics');
  const search = page.getByRole('searchbox');
  await search.focus();
  const before = await page.evaluate(() => ({
    origin: performance.timeOrigin,
    scroll: window.scrollY,
    historyLength: history.length,
  }));

  await search.pressSequentially('keyboard', { delay: 25 });

  await expect(page.locator('.guide-card')).toHaveCount(1);
  await expect(page).toHaveURL(/\/categories\/electronics\?q=keyboard$/);
  await expect(search).toBeFocused();
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(before.origin);
  expect(await page.evaluate(() => history.length)).toBe(before.historyLength);
});

test('choosing a category during the debounce uses the current input', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('searchbox').fill('keyboard');
  await page
    .getByRole('navigation', { name: 'Guide things' })
    .getByRole('link', { name: 'Electronics', exact: true })
    .click();

  // The category link carries whatever is in the box at the moment of the
  // click, including letters the debounce has not sent yet.
  await expect(page).toHaveURL(/\/categories\/electronics\?q=keyboard$/);
  await expect(page.locator('.guide-card')).toHaveCount(1);
  await expect(page.getByRole('searchbox')).toHaveValue('keyboard');
});

test('clearing live search restores results and rapid input keeps the latest query', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('searchbox');

  await search.fill('bicycle');
  await search.fill('keyboard');
  await expect(page.locator('.guide-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Inside a mechanical keyboard' })).toBeVisible();
  await expect(page).toHaveURL(/q=keyboard/);

  await search.fill('');
  await expect(page.locator('.guide-card')).toHaveCount(6);
  await expect(page).toHaveURL('/');
});

test('a slow earlier search cannot replace newer results', async ({ page }) => {
  await page.route('**/?q=bicycle*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue();
  });
  await page.goto('/');
  const search = page.getByRole('searchbox');
  await search.fill('bicycle');
  await page.waitForTimeout(300);
  await search.fill('keyboard');

  await expect(page).toHaveURL(/q=keyboard/);
  await expect(page.getByRole('heading', { name: 'Inside a mechanical keyboard' })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page).toHaveURL(/q=keyboard/);
  await expect(page.getByRole('heading', { name: 'Inside a mechanical keyboard' })).toBeVisible();
});

test('IME composition waits until composition ends before searching', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox');
  await search.focus();

  await search.dispatchEvent('compositionstart');
  await search.fill('keyboard');
  await page.waitForTimeout(350);
  await expect(page.locator('.guide-card')).toHaveCount(6);
  await expect(page).toHaveURL('/');

  await search.dispatchEvent('compositionend');
  await expect(page.locator('.guide-card')).toHaveCount(1);
  await expect(page).toHaveURL(/q=keyboard/);
});

test('explicit Enter submits immediately and Back restores the prior query', async ({ page }) => {
  await page.goto('/?q=keyboard');
  const search = page.getByRole('searchbox');
  await search.fill('bicycle');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=bicycle/);
  await expect(page.getByRole('heading', { name: 'Get to know a bicycle brake' })).toBeVisible();

  await page.goBack();
  await expect(search).toHaveValue('keyboard');
  await expect(page.getByRole('heading', { name: 'Inside a mechanical keyboard' })).toBeVisible();
});

test('Back cancels an unsent live search instead of replacing the restored history entry', async ({
  page,
}) => {
  await page.goto('/categories/electronics');
  const search = page.getByRole('searchbox');
  await search.fill('keyboard');
  await search.press('Enter');
  await expect(page).toHaveURL(/q=keyboard/);

  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await search.fill('headphones');
  await page.goBack();
  await expect(page).toHaveURL(/\/categories\/electronics$/);
  await expect(search).toHaveValue('');
  await expect(page.locator('.guide-card')).toHaveCount(3);

  await page.clock.runFor(500);
  await expect(page).toHaveURL(/\/categories\/electronics$/);
  await expect(search).toHaveValue('');
  await page.goForward();
  await expect(page).toHaveURL(/q=keyboard/);
  await expect(search).toHaveValue('keyboard');
});

test('an earlier response cannot overwrite newer input during its debounce', async ({ page }) => {
  let releaseEarlierResponse!: () => void;
  let markRequested!: () => void;
  const earlierRequest = new Promise<void>((resolve) => (markRequested = resolve));
  const responseGate = new Promise<void>((resolve) => (releaseEarlierResponse = resolve));
  await page.route('**/?q=bicycle*', async (route) => {
    markRequested();
    await responseGate;
    await route.continue();
  });
  await page.goto('/');
  const search = page.getByRole('searchbox');
  await search.fill('bicycle');
  await earlierRequest;

  // Hold the newer debounce while the real earlier server response commits.
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await search.fill('keyboard');
  releaseEarlierResponse();
  await expect(page).toHaveURL(/q=bicycle/);
  await expect(page.getByRole('heading', { name: 'Get to know a bicycle brake' })).toBeVisible();
  expect(await search.inputValue()).toBe('keyboard');

  await search.press('Enter');
  await expect(page).toHaveURL(/q=keyboard/);
  await expect(page.getByRole('heading', { name: 'Inside a mechanical keyboard' })).toBeVisible();
});

test('authorized guide metadata uses the guide title and denied guides stay generic', async ({
  page,
}) => {
  await page.goto('/guides/bicycle-brake');
  await expect(page).toHaveTitle(/Get to know a bicycle brake/);

  await page.goto('/guides/private-note');
  await expect(page).toHaveTitle(/Guide unavailable/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'This guide is not available.',
  );

  await page.goto('/preview/workshop/guides/bench-handover');
  await expect(page).toHaveTitle(/synthetic team preview/);
});
