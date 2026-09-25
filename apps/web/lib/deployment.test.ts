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
it('names PASSDOWN_URL when the Docker install sets the origin from it', () => {
  const status = readDeploymentStatus(
    {
      GUIDE_DATABASE_URL: 'postgres://guide_runtime:password@database/app',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      PASSDOWN_URL: 'http://192.168.1.20:8443',
    },
    'production',
  );
  expect(status.problems.map((p) => p.variable)).toEqual(['PASSDOWN_URL']);
  expect(status.problems[0]!.message).toContain('https://');
});
it('reports a secret file that cannot be read by its variable', () => {
  const status = readDeploymentStatus(
    {
      GUIDE_DB_RUNTIME_PASSWORD_FILE: '/run/passdown/app/missing-for-this-test',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      PASSDOWN_URL: 'https://localhost:8443',
    },
    'production',
  );
  expect(status.configured).toBe(false);
  expect(status.problems.map((p) => p.variable)).toContain('GUIDE_DB_RUNTIME_PASSWORD_FILE');
});
it('is configured by the settings the compose file passes to web', () => {
  expect(
    readDeploymentStatus(
      {
        GUIDE_DATABASE_URL: 'postgres://guide_runtime:password@postgres:5432/guide_app',
        BETTER_AUTH_SECRET: 'x'.repeat(32),
        BETTER_AUTH_URL: 'https://localhost:8443',
        PASSDOWN_URL: 'https://localhost:8443',
      },
      'production',
    ),
  ).toMatchObject({ configured: true, origin: 'https://localhost:8443' });
});
