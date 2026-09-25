import { expect, it } from 'vitest';
import { defaultLogin, finishSetupSchema } from '@guide/contracts';
import { defaultLoginEmail, defaultLoginPassword, workspaceSlug } from '../src/setup';
import {
  hashCredentialPassword,
  verifyCredentialPassword,
  canonicalAccountEmail,
} from '../src/credentials';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
const input = {
  email: 'Owner@Example.org',
  name: 'Owner',
  password: 'a long test password',
  workspaceName: 'Workshop',
};
it('uses the identity library hash format and canonical email', async () => {
  expect(canonicalAccountEmail(input.email)).toBe('owner@example.org');
  expect(
    await verifyPassword({
      password: input.password,
      hash: await hashCredentialPassword(input.password),
    }),
  ).toBe(true);
  expect(
    await verifyCredentialPassword({
      password: input.password,
      hash: await hashPassword(input.password),
    }),
  ).toBe(true);
});
it('publishes one default login, the same everywhere it is shown', () => {
  expect(defaultLogin).toEqual({ email: 'admin@example.com', password: 'changeme' });
  expect([defaultLoginEmail, defaultLoginPassword]).toEqual(['admin@example.com', 'changeme']);
});
it('refuses the default address and short passwords when finishing setup', () => {
  expect(finishSetupSchema.safeParse(input).success).toBe(true);
  for (const email of ['admin@example.com', 'ADMIN@example.com'])
    expect(
      finishSetupSchema.safeParse({ ...input, email }).error?.issues.map((i) => i.path[0]),
    ).toEqual(['email']);
  expect(
    finishSetupSchema
      .safeParse({ ...input, password: 'x'.repeat(11) })
      .error?.issues.map((i) => i.message),
  ).toEqual(['Use at least 12 characters.']);
  expect(finishSetupSchema.safeParse({ ...input, password: 'x'.repeat(201) }).success).toBe(false);
  expect(finishSetupSchema.safeParse({ ...input, workspaceName: '  ' }).success).toBe(false);
  expect(finishSetupSchema.safeParse({ ...input, code: 'old setup code' }).success).toBe(false);
});
it('derives a stable workspace address from its name', () => {
  expect(workspaceSlug('Repair Café Helsinki')).toBe('repair-cafe-helsinki');
  expect(workspaceSlug('!!!')).toBe('workspace');
  expect(workspaceSlug('x'.repeat(60))).toHaveLength(40);
});
