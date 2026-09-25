import { beforeEach, expect, it, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';
import {
  grantInstallationAdministrator,
  issueOperatorPasswordReset,
  listInstallationAdministrators,
  revokeInstallationAdministrator,
} from '@guide/database';
import { runCli, type OperatorIO } from '../cli';
import { commands } from './index';
vi.mock('@guide/database', async (load) => ({
  ...(await load<typeof import('@guide/database')>()),
  issueOperatorPasswordReset: vi.fn(),
  grantInstallationAdministrator: vi.fn(),
  revokeInstallationAdministrator: vi.fn(),
  listInstallationAdministrators: vi.fn(),
}));
function harness() {
  const out: string[] = [],
    info: string[] = [];
  const io: OperatorIO = {
    out: (s) => out.push(s),
    info: (s) => info.push(s),
    stdin: Readable.from([]),
    stdout: new Writable({ write: (_c, _e, done) => done() }),
    signal: new AbortController().signal,
    migrationsDirectory: 'unused',
    env: {
      GUIDE_OWNER_DATABASE_URL: 'postgresql://guide_owner:owner-secret@127.0.0.1:5432/app',
      BETTER_AUTH_URL: 'http://127.0.0.1:3100',
    },
  };
  return { out, info, io };
}
beforeEach(() => vi.clearAllMocks());

it('reset-password prints the link alone on stdout and its expiry, for the configured origin', async () => {
  vi.mocked(issueOperatorPasswordReset).mockResolvedValue({
    kind: 'issued',
    email: 'person@example.org',
    link: 'http://127.0.0.1:3100/reset/token',
    expiresAt: new Date('2026-09-26T10:00:00Z'),
  });
  const h = harness();
  expect(await runCli(['reset-password', '--email', 'Person@Example.org'], h.io, commands)).toBe(0);
  expect(h.out).toEqual(['http://127.0.0.1:3100/reset/token']);
  expect(h.info.join('\n')).toContain('2026-09-26 10:00 UTC');
  expect(h.info.join('\n')).toContain('privately');
  expect(vi.mocked(issueOperatorPasswordReset).mock.calls[0]![0]).toMatchObject({
    email: 'Person@Example.org',
    origin: 'http://127.0.0.1:3100',
    policy: 'loopback',
  });
});
it('reset-password refuses an unknown account with exit four and needs --email', async () => {
  vi.mocked(issueOperatorPasswordReset).mockResolvedValue({
    kind: 'refused',
    reason: 'no-account',
    message: 'No account with that address.',
  });
  const h = harness();
  expect(await runCli(['reset-password', '--email', 'nobody@example.org'], h.io, commands)).toBe(4);
  expect(h.info.join('\n')).toContain('No account with that address.');
  expect(await runCli(['reset-password'], harness().io, commands)).toBe(2);
});
it('admin grant, revoke and list report their outcomes', async () => {
  vi.mocked(grantInstallationAdministrator).mockResolvedValue({
    outcome: 'granted',
    email: 'second@example.org',
  });
  vi.mocked(revokeInstallationAdministrator).mockResolvedValue({
    outcome: 'refused',
    reason: 'last-administrator',
    message: 'That is the last installation administrator. Grant someone else first.',
  });
  vi.mocked(listInstallationAdministrators).mockResolvedValue([
    {
      email: 'owner@example.org',
      name: 'Owner',
      grantedAt: new Date('2026-09-25T09:00:00Z'),
      grantedVia: 'setup',
    },
  ]);
  const grant = harness();
  expect(await runCli(['admin', 'grant', 'second@example.org'], grant.io, commands)).toBe(0);
  expect(grant.out.join('\n')).toContain(
    'second@example.org is now an installation administrator.',
  );
  const revoke = harness();
  expect(await runCli(['admin', 'revoke', 'owner@example.org'], revoke.io, commands)).toBe(4);
  expect(revoke.info.join('\n')).toContain('last installation administrator');
  const list = harness();
  expect(await runCli(['admin', 'list'], list.io, commands)).toBe(0);
  expect(list.out).toEqual(['owner@example.org\tsetup\t2026-09-25']);
});
it('admin rejects unknown or incomplete subcommands as usage errors', async () => {
  for (const args of [['admin'], ['admin', 'promote', 'x@example.org'], ['admin', 'grant']])
    expect(await runCli(args, harness().io, commands), args.join(' ')).toBe(2);
});
