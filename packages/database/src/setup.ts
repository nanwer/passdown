import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { ownerDatabaseTarget, pgClientConfig, type ConnectionPolicy } from './config';
import { setupSchema, type SetupInput } from '@guide/contracts';
import { canonicalAccountEmail, hashCredentialPassword } from './credentials';
import { runtimeRoleIsSafe } from './runtime-role';
export type SetupOutcome =
  | { outcome: 'created'; userId: string; workspace: string }
  | { outcome: 'already-set-up' }
  | { outcome: 'workspace-exists' }
  | { outcome: 'rolled-back'; reason: string }
  | { outcome: 'uncertain'; reason: string };
export type SetupAccountInput = Omit<SetupInput, 'code'>;
function slug(name: string) {
  return (
    name
      .normalize('NFKD')
      .toLocaleLowerCase('en')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'
  );
}
export async function setupRequired(pool: Pick<pg.Pool, 'query'>): Promise<boolean> {
  const { rows } = await pool.query('SELECT EXISTS(SELECT 1 FROM public.auth_user) AS present');
  return !rows[0].present;
}
/** Called on a separately opened connection after the transaction's client is discarded. */
export async function reconcileSetup(
  pool: Pick<pg.Pool, 'connect'>,
  email: string,
): Promise<'complete' | 'empty' | 'other-account'> {
  const client = await pool.connect();
  let discard = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query("SET LOCAL lock_timeout = '5s'");
    // The old connection may still be committing. Wait for its lock before
    // describing an empty installation; a timeout means unknown, never retry.
    await client.query('SELECT pg_advisory_xact_lock(719821009)');
    const { rows } = await client.query(
      'SELECT EXISTS(SELECT 1 FROM public.auth_user) AS present, EXISTS(SELECT 1 FROM public.auth_user WHERE email=$1) AS matching',
      [canonicalAccountEmail(email)],
    );
    await client.query('COMMIT');
    return rows[0].matching ? 'complete' : rows[0].present ? 'other-account' : 'empty';
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

export async function completeSetup(
  pool: Pick<pg.Pool, 'connect'>,
  input: SetupAccountInput,
  options?: { finalStep?: (client: pg.PoolClient, userId: string) => Promise<void> },
): Promise<SetupOutcome> {
  // Protect direct callers as well as the HTTP boundary.
  const parsed = setupSchema.omit({ code: true }).parse(input);
  const password = await hashCredentialPassword(parsed.password);
  const client = await pool.connect();
  let commitSent = false;
  let discard = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query('SELECT pg_advisory_xact_lock(719821009)');
    const safe = await client.query(`SELECT ${runtimeRoleIsSafe} AS safe`);
    if (safe.rows[0]?.safe !== true) throw Error('Unsafe runtime role');
    if (!(await setupRequired(client as unknown as pg.Pool))) {
      await client.query('ROLLBACK');
      return { outcome: 'already-set-up' };
    }
    const userId = randomUUID();
    const workspace = slug(parsed.workspaceName);
    await client.query(
      'INSERT INTO public.auth_user(id,name,email,email_verified,active,must_change_password) VALUES($1,$2,$3,true,true,false)',
      [userId, parsed.name, canonicalAccountEmail(parsed.email)],
    );
    await client.query(
      "INSERT INTO public.auth_account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)",
      [randomUUID(), userId, password],
    );
    const claimed = await client.query('SELECT app.claim_first_workspace($1,$2,$3) AS claimed', [
      workspace,
      parsed.workspaceName,
      userId,
    ]);
    // The existing function returns false (rather than raising) for an existing workspace.
    if (claimed.rows[0]?.claimed !== true) {
      await client.query('ROLLBACK');
      return { outcome: 'workspace-exists' };
    }
    // The installation-administrator grant is added with its schema migration.
    await options?.finalStep?.(client, userId);
    commitSent = true;
    await client.query('COMMIT');
    return { outcome: 'created', userId, workspace };
  } catch {
    if (commitSent) {
      discard = true;
      return { outcome: 'uncertain', reason: 'The setup commit could not be confirmed.' };
    }
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
      return { outcome: 'uncertain', reason: 'The setup rollback could not be confirmed.' };
    }
    return { outcome: 'rolled-back', reason: 'Setup did not finish and nothing was created.' };
  } finally {
    client.release(discard);
  }
}

/** Owner-side setup status works before migrations without masking connection failures. */
export async function setupStateAsOwner(
  ownerURL: string,
  policy: ConnectionPolicy = 'loopback',
): Promise<'required' | 'complete'> {
  const client = new pg.Client(pgClientConfig(ownerDatabaseTarget(ownerURL, policy)));
  await client.connect();
  try {
    const table = await client.query(
      "SELECT to_regclass('public.auth_user') IS NOT NULL AS present",
    );
    if (!table.rows[0]?.present) return 'required';
    return (await setupRequired(client as unknown as pg.Pool)) ? 'required' : 'complete';
  } finally {
    await client.end();
  }
}
