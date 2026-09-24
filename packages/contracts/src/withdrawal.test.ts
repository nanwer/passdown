import { expect, it } from 'vitest';
import { publishSchema } from './index';
it('requires a publication revision before publishing', () => {
  expect(
    publishSchema.safeParse({ expectedVersion: 1, expectedRelease: null, license: 'CC-BY-4.0' })
      .success,
  ).toBe(false);
});
import * as contracts from './index';
it('validates withdrawal reasons and rejects extra fields', () => {
  expect(contracts.withdrawGuideSchema).toBeDefined();
  const base = { expectedRelease: 1, expectedPublicationRevision: 0 };
  expect(contracts.withdrawGuideSchema.parse({ ...base, reason: '  outdated  ' }).reason).toBe(
    'outdated',
  );
  expect(
    contracts.withdrawGuideSchema.safeParse({ ...base, reason: 'a'.repeat(501) }).success,
  ).toBe(false);
  expect(contracts.withdrawGuideSchema.safeParse({ ...base, unexpected: true }).success).toBe(
    false,
  );
  expect(contracts.reinstateGuideSchema.safeParse({ expectedRelease: 1 }).success).toBe(false);
});
