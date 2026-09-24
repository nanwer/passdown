import { expect, it } from 'vitest';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import {
  canonicalAccountEmail,
  hashCredentialPassword,
  verifyCredentialPassword,
} from '../src/credentials';
it('uses the sign-in library hash format and exact email normalization', async () => {
  const password = 'a long synthetic test password';
  expect(canonicalAccountEmail('Owner@Example.org')).toBe('owner@example.org');
  expect(await verifyPassword({ password, hash: await hashCredentialPassword(password) })).toBe(
    true,
  );
  expect(await verifyCredentialPassword({ password, hash: await hashPassword(password) })).toBe(
    true,
  );
  expect(
    await verifyCredentialPassword({ password: 'incorrect', hash: await hashPassword(password) }),
  ).toBe(false);
});
