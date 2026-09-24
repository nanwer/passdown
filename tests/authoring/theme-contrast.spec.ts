import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readConfig } from '../../scripts/local-config.mjs';

const credentials = readConfig();

test('management buttons retain readable contrast throughout theme changes', async ({ page }) => {
  const response = await page.request.post('/api/auth/sign-in/email', {
    headers: { Origin: 'http://127.0.0.1:3101' },
    data: {
      email: credentials.GUIDE_LOCAL_OWNER_EMAIL,
      password: credentials.GUIDE_LOCAL_OWNER_PASSWORD,
    },
  });
  expect(response.status()).toBe(200);
  await page.goto('/studio/workshop/categories');
  await expect(page.getByRole('button', { name: 'Columns', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to dark theme' })).toBeVisible();
  for (const theme of ['dark', 'light'] as const) {
    const transitions = await page.evaluateHandle((theme) => {
      // Commit the starting styles, then toggle and pause the browser's own
      // transitions in the same task. No extra transition or delay is added.
      for (const button of document.querySelectorAll('button'))
        getComputedStyle(button).backgroundColor;
      document
        .querySelector<HTMLButtonElement>(`button[aria-label="Switch to ${theme} theme"]`)!
        .click();
      const animations = document
        .getAnimations()
        .filter(
          (animation) =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === 'background-color',
        );
      for (const animation of animations) animation.pause();
      return animations;
    }, theme);
    try {
      // Check transient frames as well as the endpoint; waiting for the theme
      // to settle would hide the white-text-on-light-background defect.
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        await transitions.evaluate((animations, fraction) => {
          for (const animation of animations)
            animation.currentTime = Number(animation.effect!.getTiming().duration) * fraction;
        }, fraction);
        const result = await new AxeBuilder({ page })
          .include('button')
          .withRules(['color-contrast'])
          .analyze();
        expect(result.violations, `${theme} theme at ${fraction * 100}% of transition`).toEqual([]);
      }
    } finally {
      await transitions.evaluate((animations) =>
        animations.forEach((animation) => animation.finish()),
      );
      await transitions.dispose();
    }
  }
});
