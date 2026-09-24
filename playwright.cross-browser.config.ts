import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Run the complete fixture suite after Chromium, with an independently owned server.
export default defineConfig({
  ...base,
  outputDir: './test-results/cross-browser',
  workers: 1,
  use: {
    ...base.use,
    channel: undefined,
    baseURL: 'http://127.0.0.1:3105',
  },
  projects: [
    { name: 'firefox', grepInvert: /@api\b/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', grepInvert: /@api\b/, use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm --filter @guide/web exec next dev --hostname 127.0.0.1 --port 3105',
    env: {
      GUIDE_DATABASE_URL: '',
      GUIDE_DEMO_PREVIEW: '1',
      GUIDE_NEXT_DIST_DIR: '.next-cross-browser',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    url: 'http://127.0.0.1:3105',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
