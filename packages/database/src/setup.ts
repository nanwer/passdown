import pg from 'pg';
import { ownerDatabaseTarget, pgClientConfig, type ConnectionPolicy } from './config';
import { defaultLogin } from '@guide/contracts';
import { hashCredentialPassword } from './credentials';

/**
 * The published first login of a new installation (see migration 033). It is
 * printed in the install guide and on the sign-in page while it is active; it
 * can only be used to finish setting up, which retires it.
 */
export const defaultLoginEmail = defaultLogin.email;
export const defaultLoginPassword = defaultLogin.password;

/**
 * - `default-login`: the default login is waiting to be replaced.
 * - `no-account`: nobody can sign in (migrations have not created the default
 *   login, or the database holds a workspace without accounts).
 * - `complete`: set up.
 */
export type SetupState = 'default-login' | 'no-account' | 'complete';

export function workspaceSlug(name: string) {
  return (
    name
      .normalize('NFKD')
      .toLocaleLowerCase('en')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'
  );
}

export async function setupState(pool: Pick<pg.Pool, 'query'>): Promise<SetupState> {
  const { rows } = await pool.query('SELECT app.setup_state() AS state');
  return rows[0].state;
}

/**
 * Create the default login in an empty database, as the database owner.
 * Idempotent and race-safe: the database function takes a lock and does
 * nothing once any account or workspace exists, so restores and installations
 * that were ever set up never get one.
 */
export async function ensureDefaultLogin(
  ownerURL: string,
  policy: ConnectionPolicy = 'loopback',
): Promise<'created' | 'not-needed'> {
  const hash = await hashCredentialPassword(defaultLoginPassword);
  const client = new pg.Client(pgClientConfig(ownerDatabaseTarget(ownerURL, policy)));
  await client.connect();
  try {
    // Read committed, whatever the database default: the function's checks run
    // after its lock and must see a concurrent start's committed account.
    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    await client.query("SET LOCAL lock_timeout = '5s'");
    const { rows } = await client.query('SELECT app.operator_create_default_login($1) AS id', [
      hash,
    ]);
    await client.query('COMMIT');
    return rows[0].id ? 'created' : 'not-needed';
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

/** Owner-side setup status works before migrations without masking connection failures. */
export async function setupStateAsOwner(
  ownerURL: string,
  policy: ConnectionPolicy = 'loopback',
): Promise<SetupState> {
  const client = new pg.Client(pgClientConfig(ownerDatabaseTarget(ownerURL, policy)));
  await client.connect();
  try {
    const present = await client.query(
      "SELECT to_regclass('public.auth_user') IS NOT NULL AS users, to_regprocedure('app.setup_state()') IS NOT NULL AS state",
    );
    if (!present.rows[0]?.users) return 'no-account';
    // A database older than the default login: accounts mean it is set up.
    if (!present.rows[0]?.state) {
      const { rows } = await client.query(
        'SELECT EXISTS(SELECT 1 FROM public.auth_user) AS present',
      );
      return rows[0].present ? 'complete' : 'no-account';
    }
    return await setupState(client as unknown as pg.Pool);
  } finally {
    await client.end();
  }
}
