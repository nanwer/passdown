import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/authoring',
  outputDir: './test-results/authoring',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL },
    },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grepInvert: /@api\b/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grepInvert: /@api\b/ },
  ],
  webServer: {
    command: 'pnpm exec tsx scripts/authoring-test-server.ts',
    url: 'http://127.0.0.1:3101/api/health',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
