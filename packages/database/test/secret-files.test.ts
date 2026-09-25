import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { applySecretFiles, resolveSecretFiles } from '../src/secret-files';
import { ConfigurationError } from '../src/config';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function secrets(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'passdown-secret-files-'));
  directories.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return (name: string) => join(dir, name);
}
const problem = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigurationError);
    return { variable: (error as ConfigurationError).variable, message: (error as Error).message };
  }
  throw new Error('Expected a configuration problem.');
};

it('builds the database addresses, session secret and origin from files and PASSDOWN_URL', () => {
  const path = secrets({ owner: 'a'.repeat(64) + '\n', runtime: 'b/+c', session: 's'.repeat(96) });
  const env = resolveSecretFiles({
    GUIDE_DB_OWNER_PASSWORD_FILE: path('owner'),
    GUIDE_DB_RUNTIME_PASSWORD_FILE: path('runtime'),
    BETTER_AUTH_SECRET_FILE: path('session'),
    PASSDOWN_URL: 'https://192.168.1.20:8443',
    OTHER: 'kept',
  });
  expect(env).toEqual({
    GUIDE_OWNER_DATABASE_URL: `postgresql://guide_owner:${'a'.repeat(64)}@postgres:5432/guide_app`,
    // Encoded: a password is never read as part of the address.
    GUIDE_DATABASE_URL: 'postgresql://guide_runtime:b%2F%2Bc@postgres:5432/guide_app',
    BETTER_AUTH_SECRET: 's'.repeat(96),
    BETTER_AUTH_URL: 'https://192.168.1.20:8443',
    PASSDOWN_URL: 'https://192.168.1.20:8443',
    OTHER: 'kept',
  });
});

it('gives web only what its files name, and honours another database host', () => {
  const path = secrets({ runtime: 'r'.repeat(64), session: 's'.repeat(96) });
  const env = resolveSecretFiles({
    GUIDE_DB_RUNTIME_PASSWORD_FILE: path('runtime'),
    BETTER_AUTH_SECRET_FILE: path('session'),
    PASSDOWN_DATABASE_HOST: 'db.internal',
  });
  expect(env.GUIDE_OWNER_DATABASE_URL).toBeUndefined();
  expect(env.GUIDE_DATABASE_URL).toBe(
    `postgresql://guide_runtime:${'r'.repeat(64)}@db.internal:5432/guide_app`,
  );
});

it('leaves an environment without file settings unchanged', () => {
  const env = { GUIDE_DATABASE_URL: 'postgresql://x', BETTER_AUTH_URL: 'http://127.0.0.1:3100' };
  expect(resolveSecretFiles(env)).toEqual(env);
});

it('reports unreadable, relative, empty and multi-line files by variable, never by content', () => {
  const path = secrets({ empty: '', lines: 'one\ntwo\n', spaced: 'has space' });
  expect(problem(() => resolveSecretFiles({ BETTER_AUTH_SECRET_FILE: path('missing') }))).toEqual({
    variable: 'BETTER_AUTH_SECRET_FILE',
    message: expect.stringContaining('cannot be read'),
  });
  expect(
    problem(() => resolveSecretFiles({ BETTER_AUTH_SECRET_FILE: 'secrets/session' })).variable,
  ).toBe('BETTER_AUTH_SECRET_FILE');
  for (const name of ['empty', 'lines', 'spaced']) {
    const found = problem(() => resolveSecretFiles({ GUIDE_DB_RUNTIME_PASSWORD_FILE: path(name) }));
    expect(found.variable).toBe('GUIDE_DB_RUNTIME_PASSWORD_FILE');
    expect(found.message).not.toMatch(/two|has space/);
  }
});

it('refuses two sources for one setting and an unusable database host', () => {
  const path = secrets({ runtime: 'r'.repeat(64) });
  expect(
    problem(() =>
      resolveSecretFiles({
        GUIDE_DB_RUNTIME_PASSWORD_FILE: path('runtime'),
        GUIDE_DATABASE_URL: 'postgresql://guide_runtime:x@postgres/guide_app',
      }),
    ).variable,
  ).toBe('GUIDE_DB_RUNTIME_PASSWORD_FILE');
  expect(
    problem(() =>
      resolveSecretFiles({
        PASSDOWN_URL: 'https://a.example',
        BETTER_AUTH_URL: 'https://b.example',
      }),
    ).variable,
  ).toBe('PASSDOWN_URL');
  expect(
    resolveSecretFiles({ PASSDOWN_URL: 'https://a.example', BETTER_AUTH_URL: 'https://a.example' })
      .BETTER_AUTH_URL,
  ).toBe('https://a.example');
  expect(problem(() => resolveSecretFiles({ PASSDOWN_DATABASE_HOST: 'x y' })).variable).toBe(
    'PASSDOWN_DATABASE_HOST',
  );
});

it('applies once in place, and leaves the environment untouched when a file is wrong', () => {
  const path = secrets({ session: 's'.repeat(96) });
  const env: Record<string, string | undefined> = { BETTER_AUTH_SECRET_FILE: path('session') };
  expect(applySecretFiles(env)).toBeNull();
  expect(env).toEqual({ BETTER_AUTH_SECRET: 's'.repeat(96) });
  // Applying again is a no-op rather than a conflict.
  expect(applySecretFiles(env)).toBeNull();
  const broken: Record<string, string | undefined> = { BETTER_AUTH_SECRET_FILE: path('missing') };
  expect(applySecretFiles(broken)?.variable).toBe('BETTER_AUTH_SECRET_FILE');
  expect(broken).toEqual({ BETTER_AUTH_SECRET_FILE: path('missing') });
});
