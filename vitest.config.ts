import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
const pkg = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@guide/content': pkg('./packages/guide-content/src/index.ts'),
      '@guide/core': pkg('./packages/core/src/index.ts'),
      '@guide/contracts': pkg('./packages/contracts/src/index.ts'),
      '@guide/database': pkg('./packages/database/src/index.ts'),
      '@guide/testing': pkg('./packages/testing/src/index.ts'),
      '@guide/ui': pkg('./packages/ui/src/index.ts'),
      '@guide/guide-ui': pkg('./packages/guide-ui/src/index.ts'),
    },
  },
  test: {
    include: [
      'packages/**/*.test.{ts,tsx}',
      'apps/operator/**/*.test.ts',
      'deploy/**/*.test.ts',
      'scripts/**/*.test.ts',
      'tests/support/**/*.test.ts',
      'apps/web/lib/**/*.test.ts',
      'apps/web/components/**/*.test.{ts,tsx}',
    ],
    environment: 'node',
  },
});
