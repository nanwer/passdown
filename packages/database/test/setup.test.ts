import { expect, it, vi } from 'vitest';
import { completeSetup } from '../src/setup';
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
it('rolls back a failing final step without any out-of-transaction deletion', async () => {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes(' AS present')
      ? [{ present: false }]
      : sql.includes(' AS claimed')
        ? [{ claimed: true }]
        : [{ safe: true }],
  }));
  const release = vi.fn();
  const outcome = await completeSetup(
    { connect: async () => ({ query, release }) } as never,
    input,
    {
      finalStep: async () => {
        throw Error('private database detail');
      },
    },
  );
  expect(outcome.outcome).toBe('rolled-back');
  expect(query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(true);
  expect(query.mock.calls.some(([sql]) => /DELETE|COMMIT/.test(sql))).toBe(false);
  expect(JSON.stringify(outcome)).not.toContain('private');
  expect(release).toHaveBeenCalled();
});
it('reports a lost commit acknowledgement as uncertain and discards the connection', async () => {
  const query = vi.fn(async (sql: string) => {
    if (sql === 'COMMIT') throw Error('connection lost');
    return {
      rows: sql.includes(' AS present')
        ? [{ present: false }]
        : sql.includes(' AS claimed')
          ? [{ claimed: true }]
          : [{ safe: true }],
    };
  });
  const release = vi.fn();
  const outcome = await completeSetup(
    { connect: async () => ({ query, release }) } as never,
    input,
  );
  expect(outcome.outcome).toBe('uncertain');
  expect(query.mock.calls.some(([sql]) => /DELETE|ROLLBACK/.test(sql))).toBe(false);
  expect(release).toHaveBeenCalledWith(true);
});

it('waits for the setup lock before reconciling a lost commit and queries the submitted email directly', async () => {
  const { reconcileSetup } = await import('../src/setup');
  const calls: string[] = [];
  const query = vi.fn(async (sql: string) => {
    calls.push(sql);
    return { rows: [{ present: true, matching: true }] };
  });
  expect(
    await reconcileSetup(
      { connect: async () => ({ query, release: vi.fn() }) } as never,
      'Owner@Example.org',
    ),
  ).toBe('complete');
  expect(calls[0]).toBe('BEGIN');
  expect(calls[2]).toContain('pg_advisory_xact_lock(719821009)');
  expect(calls[3]).toContain('WHERE email=$1');
  expect(calls.at(-1)).toBe('COMMIT');
});
