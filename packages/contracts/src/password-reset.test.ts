import { expect, it } from 'vitest';
import * as contracts from './index';
it('requires a 12–200 character reset password and rejects unknown fields', () => {
  expect(contracts.redeemPasswordResetSchema).toBeDefined();
  expect(contracts.redeemPasswordResetSchema.safeParse({ password: 'a'.repeat(11) }).success).toBe(
    false,
  );
  expect(contracts.redeemPasswordResetSchema.safeParse({ password: 'a'.repeat(12) }).success).toBe(
    true,
  );
  expect(contracts.redeemPasswordResetSchema.safeParse({ password: 'a'.repeat(201) }).success).toBe(
    false,
  );
  expect(
    contracts.redeemPasswordResetSchema.safeParse({
      password: 'a'.repeat(12),
      email: 'other@test.local',
    }).success,
  ).toBe(false);
});
