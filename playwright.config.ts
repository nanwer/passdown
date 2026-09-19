import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/fixtures',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:3102',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @guide/web exec next dev --hostname 127.0.0.1 --port 3102',
    env: {
      GUIDE_DATABASE_URL: '',
      GUIDE_DEMO_PREVIEW: '1',
      GUIDE_NEXT_DIST_DIR: '.next-fixtures',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    url: 'http://127.0.0.1:3102',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
