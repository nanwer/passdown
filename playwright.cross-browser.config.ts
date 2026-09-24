import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// A focused compatibility check; the complete fixture suite stays on Chromium.
export default defineConfig({
  ...base,
  testMatch: ['visual-editor.spec.ts', 'management-focus.spec.ts'],
  outputDir: './test-results/cross-browser',
  workers: 1,
  use: {
    ...base.use,
    channel: undefined,
    baseURL: 'http://127.0.0.1:3105',
  },
  projects: [
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
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
