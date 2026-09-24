import { pressTab } from '../support/browser';
import { expect, test, type Page } from '@playwright/test';

const workspaceTrigger = (page: Page) => page.locator('.workspace-menu summary');

async function expectNoHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

async function expectFullyReachable(locator: ReturnType<Page['locator']>) {
  expect(
    await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      let clipTop = 0;
      let clipRight = window.innerWidth;
      let clipBottom = window.innerHeight;
      let clipLeft = 0;
      let ancestor = element.parentElement;
      while (ancestor) {
        const style = getComputedStyle(ancestor);
        if (/(auto|scroll|hidden|clip)/.test(`${style.overflow} ${style.overflowY}`)) {
          const ancestorRect = ancestor.getBoundingClientRect();
          clipTop = Math.max(clipTop, ancestorRect.top);
          clipRight = Math.min(clipRight, ancestorRect.right);
          clipBottom = Math.min(clipBottom, ancestorRect.bottom);
          clipLeft = Math.max(clipLeft, ancestorRect.left);
        }
        ancestor = ancestor.parentElement;
      }
      return (
        rect.top >= clipTop &&
        rect.right <= clipRight &&
        rect.bottom <= clipBottom &&
        rect.left >= clipLeft
      );
    }),
  ).toBe(true);
}

test('workspace disclosure identifies the current workspace and preserves its library', async ({
  page,
}) => {
  await page.goto('/preview/workshop');
  const trigger = workspaceTrigger(page);
  await expect(trigger).toHaveAccessibleName('Current workspace: Workshop operations');
  await trigger.click();
  await expect(page.getByRole('link', { name: 'Workshop operations' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Library' }),
  ).toHaveAttribute('href', '/preview/workshop');
});

test('workspace disclosure supports keyboard opening and all non-modal closing paths', async ({
  page,
}) => {
  await page.goto('/');
  const trigger = workspaceTrigger(page);
  const popup = page.getByRole('group', { name: 'Choose workspace' });

  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(popup).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await expect(trigger).toBeFocused();

  // Keep the focus-leaving case keyboard-driven. Native summary clicks can
  // establish a different sequential-navigation start point in WebKit.
  await trigger.press('Enter');
  await expect(popup).toBeVisible();
  await pressTab(page, { shift: true });
  await expect(popup).toBeHidden();
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeFocused();

  await trigger.click();
  await page.locator('main').click({ position: { x: 1, y: 1 } });
  await expect(popup).toBeHidden();
});

test('skip link focuses main content below the sticky header', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  // Establish client hydration before adding external history state.
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.evaluate(() =>
    history.replaceState({ ...history.state, consumerMarker: 'keep' }, '', location.href),
  );
  await skip.evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const headerBottom = document.querySelector('header')!.getBoundingClientRect().bottom;
        const mainTop = document.querySelector('main')!.getBoundingClientRect().top;
        return mainTop >= headerBottom && mainTop < window.innerHeight;
      }),
    )
    .toBe(true);
  expect(await page.evaluate(() => history.state.consumerMarker)).toBe('keep');
});

test('search submission keeps keyboard focus while history still synchronizes the field', async ({
  page,
}) => {
  await page.goto('/');
  const search = page.getByRole('searchbox');
  await search.fill('keyboard');
  await search.press('Enter');
  await expect(page).toHaveURL(/\?q=keyboard$/);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('keyboard');

  await search.fill('bicycle');
  await search.press('Enter');
  await expect(page).toHaveURL(/\?q=bicycle$/);
  await page.goBack();
  await expect(page.getByRole('searchbox')).toHaveValue('keyboard');
});

for (const viewport of [
  { name: '320px viewport', width: 320, height: 568 },
  { name: '400% reflow equivalent', width: 320, height: 180 },
]) {
  test(`${viewport.name} keeps workspace and dialog controls reachable`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await workspaceTrigger(page).click();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('group', { name: 'Choose workspace' })).toBeInViewport();
    const teamWorkspace = page.getByRole('link', { name: 'Workshop operations' });
    await teamWorkspace.focus();
    await expectFullyReachable(teamWorkspace);

    // Dialog geometry at this width moved to the authoring suite with the
    // design workshop page; every remaining dialog needs a sign-in.
  });
}

test('forced colors retain visible control boundaries and reduced motion removes smooth scrolling', async ({
  page,
}) => {
  // Use motion the application actually has: smooth scrolling and the real
  // pending sign-in indicator. Button color changes are deliberately instant.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/sign-in/email', async (route) => {
    await held;
    await route.fulfill({
      status: 401,
      json: { error: { code: 'UNAUTHORIZED', message: 'Motion check finished.' } },
    });
  });
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  await page.goto('/sign-in');
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'smooth');
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill('motion@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Synthetic motion check');
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  await submit.click();
  const spinner = submit.locator('span');
  try {
    await expect(submit).toHaveAttribute('aria-busy', 'true');
    await expect(spinner).toHaveCount(1);
    await expect(spinner).not.toHaveCSS('animation-name', 'none');
    await expect(spinner).not.toHaveCSS('animation-duration', '0s');

    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
    await expect(spinner).toHaveCSS('animation-name', 'none');
    await expect(submit).toHaveCSS('transition-duration', '0s');
    // Reducing motion must not conceal the pending state or permit resubmission.
    await expect(submit).toHaveAttribute('aria-busy', 'true');
    await expect(submit).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.getByRole('alert').filter({ hasText: 'Motion check finished.' })).toBeVisible();

  await page.goto('/');

  const trigger = workspaceTrigger(page);
  await trigger.click();
  const forcedColorBoundary = await trigger.evaluate((node) => {
    const probe = document.createElement('span');
    probe.style.color = 'CanvasText';
    document.body.append(probe);
    const systemCanvasText = getComputedStyle(probe).color;
    probe.remove();
    return {
      borderColor: getComputedStyle(node).borderColor,
      systemCanvasText,
    };
  });
  expect(forcedColorBoundary.borderColor).toBe(forcedColorBoundary.systemCanvasText);
  await expect(page.getByRole('group', { name: 'Choose workspace' })).toBeVisible();
});
