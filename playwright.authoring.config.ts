import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/authoring',
  outputDir: './test-results/authoring',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm exec tsx scripts/authoring-test-server.ts',
    url: 'http://127.0.0.1:3101/api/health',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
