import { describe, expect, it } from 'vitest';
import { createApplicationStore, createIdentity } from '../src/index';
describe('persistent infrastructure configuration', () => {
  it('rejects missing and non-loopback database configuration', () => {
    expect(() => createApplicationStore({ connectionString: '' })).toThrow(/database/i);
    expect(() =>
      createApplicationStore({ connectionString: 'postgres://user:pass@example.com/db' }),
    ).toThrow(/loopback/i);
  });
  it('refuses migration credentials in application factories', () => {
    expect(() =>
      createApplicationStore({
        connectionString: 'postgres://guide_owner:secret@127.0.0.1/guide_app',
      }),
    ).toThrow(/runtime/i);
  });
  it('rejects remote identity origin and short secrets', () => {
    expect(() =>
      createIdentity({
        connectionString: 'postgres://u:p@127.0.0.1/db',
        secret: 'short',
        baseURL: 'http://127.0.0.1:3000',
      }),
    ).toThrow(/secret/i);
    expect(() =>
      createIdentity({
        connectionString: 'postgres://u:p@127.0.0.1/db',
        secret: 'x'.repeat(48),
        baseURL: 'https://example.com',
      }),
    ).toThrow(/loopback/i);
  });
});

it('accepts explicit deployment hosts and enables secure identity cookies', async () => {
  const connectionString = 'postgres://guide_runtime:synthetic@database/app';
  const store = createApplicationStore({ connectionString, policy: 'deployment' });
  const identity = createIdentity({
    connectionString,
    policy: 'deployment',
    secret: 'x'.repeat(48),
    baseURL: 'https://example.org',
  });
  expect(identity.options.advanced?.useSecureCookies).toBe(true);
  await identity.close();
  await store.close();
});
