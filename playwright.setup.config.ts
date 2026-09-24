import { defineConfig, devices } from '@playwright/test';
const browser = process.env.SETUP_BROWSER ?? 'chromium';
const device =
  browser === 'firefox'
    ? devices['Desktop Firefox']
    : browser === 'webkit'
      ? devices['Desktop Safari']
      : devices['Desktop Chrome'];
export default defineConfig({
  testDir: './tests/setup',
  outputDir: `./test-results/setup-${browser}`,
  fullyParallel: false,
  workers: 1,
  timeout: 120000,
  use: { baseURL: 'http://127.0.0.1:3106', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    {
      name: browser,
      use: {
        ...device,
        ...(browser === 'chromium' && process.env.PLAYWRIGHT_CHANNEL
          ? { channel: process.env.PLAYWRIGHT_CHANNEL }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'pnpm exec tsx scripts/setup-test-server.ts',
    url: 'http://127.0.0.1:3106/api/health',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
