import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/fixtures',
  fullyParallel: true,
  // The development server compiles each route on first request. Compile them
  // all before any test, so no assertion's time limit includes a compile.
  globalSetup: './tests/support/warm-routes.ts',
  // Keep the development server from competing with a browser worker for
  // every available CPU on larger machines.
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:3102',
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL },
    },
  ],
  webServer: {
    command: 'pnpm --filter @guide/web exec next dev --hostname 127.0.0.1 --port 3102',
    env: {
      GUIDE_DATABASE_URL: '',
      GUIDE_DEMO_PREVIEW: '1',
      GUIDE_NEXT_DIST_DIR: '.next-fixtures',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    url: 'http://127.0.0.1:3102',
    // A concurrent run must not adopt a server that its owner will tear down.
    reuseExistingServer: false,
    timeout: 120000,
  },
});
