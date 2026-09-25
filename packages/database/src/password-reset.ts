import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { ownerDatabaseTarget, pgClientConfig, type ConnectionPolicy } from './config';
import { canonicalAccountEmail } from './credentials';

/** Runs in the setup caller's transaction, so any later rollback removes the grant too. */
export async function completeSetupAdministrator(
  client: Pick<pg.PoolClient, 'query'>,
  accountId: string,
): Promise<void> {
  await client.query('SELECT app.setup_installation_administrator($1)', [accountId]);
}
export function formatOperatorExpiry(expiresAt: Date): string {
  return `${expiresAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
async function ownerTransaction<T>(
  url: string,
  policy: ConnectionPolicy | undefined,
  run: (c: pg.Client) => Promise<T>,
): Promise<T> {
  // The same strict connection policy as every other operator connection.
  const c = new pg.Client(pgClientConfig(ownerDatabaseTarget(url, policy ?? 'loopback')));
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='5s'");
    const result = await run(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    await c.end();
  }
}
type Refusal = {
  kind: 'refused';
  reason: 'no-account' | 'suspended' | 'unverified' | 'no-password' | 'schema-behind';
  message: string;
};
export type OperatorResetResult =
  { kind: 'issued'; email: string; link: string; expiresAt: Date } | Refusal;
function refusal(error: unknown): Refusal | null {
  const code = (error as { code?: string }).code,
    message = (error as Error).message;
  if (code === '42883')
    return {
      kind: 'refused',
      reason: 'schema-behind',
      message: 'The database is behind this version. Run passdown migrate first.',
    };
  if (code === '23514')
    return {
      kind: 'refused',
      reason: message.includes('suspended')
        ? 'suspended'
        : message.includes('confirmed')
          ? 'unverified'
          : 'no-password',
      message,
    };
  return null;
}
export async function issueOperatorPasswordReset(input: {
  ownerDatabaseURL: string;
  policy?: ConnectionPolicy;
  origin: string;
  email: string;
}): Promise<OperatorResetResult> {
  const token = randomBytes(32).toString('base64url');
  const hash = createHash('sha256').update(token).digest('hex');
  try {
    const row = await ownerTransaction(
      input.ownerDatabaseURL,
      input.policy,
      async (c) =>
        (
          await c.query('SELECT * FROM app.operator_issue_password_reset($1,$2)', [
            canonicalAccountEmail(input.email),
            hash,
          ])
        ).rows[0],
    );
    return row
      ? {
          kind: 'issued',
          email: row.account_email,
          link: new URL(`/reset/${token}`, input.origin).href,
          expiresAt: new Date(row.reset_expires_at),
        }
      : { kind: 'refused', reason: 'no-account', message: 'No account with that address.' };
  } catch (e) {
    const result = refusal(e);
    if (result) return result;
    throw e;
  }
}
export async function grantInstallationAdministrator(input: {
  ownerDatabaseURL: string;
  policy?: ConnectionPolicy;
  email: string;
}) {
  try {
    const row = await ownerTransaction(
      input.ownerDatabaseURL,
      input.policy,
      async (c) =>
        (
          await c.query('SELECT * FROM app.operator_grant_administrator($1)', [
            canonicalAccountEmail(input.email),
          ])
        ).rows[0],
    );
    return row.outcome === 'no-account'
      ? {
          outcome: 'refused' as const,
          reason: 'no-account',
          message: 'No account with that address.',
        }
      : { outcome: row.outcome as 'granted' | 'already', email: row.account_email as string };
  } catch (e) {
    const result = refusal(e);
    if (result)
      return {
        outcome: 'refused' as const,
        reason: result.reason === 'schema-behind' ? 'schema-behind' : 'cannot-sign-in',
        message: result.message,
      };
    throw e;
  }
}
export async function revokeInstallationAdministrator(input: {
  ownerDatabaseURL: string;
  policy?: ConnectionPolicy;
  email: string;
}) {
  try {
    const row = await ownerTransaction(
      input.ownerDatabaseURL,
      input.policy,
      async (c) =>
        (
          await c.query('SELECT * FROM app.operator_revoke_administrator($1)', [
            canonicalAccountEmail(input.email),
          ])
        ).rows[0],
    );
    if (row.outcome === 'revoked')
      return {
        outcome: 'revoked' as const,
        email: row.account_email as string,
        remaining: Number(row.remaining),
      };
    const messages: Record<string, string> = {
      'no-account': 'No account with that address.',
      'not-administrator': 'That account is not an installation administrator.',
      'last-administrator':
        'That is the last installation administrator. Grant someone else first.',
    };
    return {
      outcome: 'refused' as const,
      reason: row.outcome as string,
      message: messages[row.outcome]!,
    };
  } catch (e) {
    const result = refusal(e);
    if (result)
      return { outcome: 'refused' as const, reason: result.reason, message: result.message };
    throw e;
  }
}
export async function listInstallationAdministrators(input: {
  ownerDatabaseURL: string;
  policy?: ConnectionPolicy;
}) {
  return ownerTransaction(input.ownerDatabaseURL, input.policy, async (c) =>
    (await c.query('SELECT * FROM app.operator_list_administrators()')).rows.map((r) => ({
      email: r.account_email as string,
      name: r.account_name as string,
      grantedAt: new Date(r.admin_granted_at),
      grantedVia: r.admin_granted_via as 'setup' | 'upgrade' | 'command',
    })),
  );
}
