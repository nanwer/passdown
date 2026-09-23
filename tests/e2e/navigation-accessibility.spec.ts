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

  await trigger.click();
  await trigger.focus();
  await page.keyboard.press('Shift+Tab');
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
  // The design workshop page used to supply a button and a spinner on a
  // public URL. The sign-in form is now the only unauthenticated page with a
  // real button, so the motion readings happen there and the forced-colour
  // reading stays on the library, which is where the workspace control lives.
  await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
  await page.goto('/sign-in');
  const normalMotion = await page.evaluate(
    () => getComputedStyle(document.querySelector('form button')!).transitionDuration,
  );
  expect(normalMotion).not.toBe('0s');

  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await page.reload();
  const adapted = await page.evaluate(() => ({
    buttonTransition: getComputedStyle(document.querySelector('form button')!).transitionDuration,
    rootScroll: getComputedStyle(document.documentElement).scrollBehavior,
  }));
  expect(adapted.buttonTransition).toBe('0s');
  expect(adapted.rootScroll).toBe('auto');

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
