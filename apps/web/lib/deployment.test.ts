import { expect, it } from 'vitest';
import { readDeploymentStatus, sampleLibraryEnabled, previewIdentitiesEnabled } from './deployment';
it('refuses samples and preview identities in production even when requested', () => {
  expect(sampleLibraryEnabled({}, 'production')).toBe(false);
  expect(previewIdentitiesEnabled({ GUIDE_DEMO_PREVIEW: '1' }, 'production')).toBe(false);
  expect(sampleLibraryEnabled({}, 'development')).toBe(true);
});
it('reports production configuration by name, never by value', () => {
  const status = readDeploymentStatus(
    {
      GUIDE_DATABASE_URL: 'postgres://owner:private@remote/app',
      BETTER_AUTH_SECRET: 'private',
      BETTER_AUTH_URL: 'http://remote',
    },
    'production',
  );
  expect(status.configured).toBe(false);
  expect(status.problems.map((p) => p.variable)).toEqual([
    'GUIDE_DATABASE_URL',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_URL',
  ]);
  expect(JSON.stringify(status)).not.toContain('private');
});
it('does not require setup hash for completed installations', () => {
  const env = {
    GUIDE_DATABASE_URL: 'postgres://guide_runtime:password@database/app',
    BETTER_AUTH_SECRET: 'x'.repeat(32),
    BETTER_AUTH_URL: 'https://example.org',
    PASSDOWN_SETUP_CODE_SHA256: 'bad',
  };
  expect(readDeploymentStatus(env, 'production')).toMatchObject({
    configured: true,
    setupCodeHash: undefined,
  });
});
