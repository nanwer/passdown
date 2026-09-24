import { randomBytes } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { createIdentity } from './identity';

/**
 * The first administrator of an installation, and something for them to manage.
 *
 * The requirement this serves is a single deploy script and nothing else to
 * run, so this happens by itself the first time the application starts against
 * a database with no users. There is no wizard: a first-run page whose only
 * guard is "nobody has signed up yet" is a race anyone on the network can win,
 * so the account is created before this process answers its first request.
 * The administrator already exists and its password has only
 * ever been written where the operator can reach it.
 *
 * The emptiness of the database is the lock. Nothing is written to say setup
 * has happened, so there is no flag to clear and no file that could be restored
 * from a backup into a state where this runs again while accounts still exist.
 */
export type BootstrapResult =
  | { created: false; reason: 'users-exist' }
  | { created: true; email: string; password: string | null; workspace: string };

/** Readable, and short enough to retype from a terminal without hating it. */
function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

function slug(name: string): string {
  const base = name
    .normalize('NFKD')
    .toLocaleLowerCase('en')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'workspace';
}

export async function bootstrapFirstRun(options: {
  connectionString: string;
  secret: string;
  baseURL: string;
  email?: string;
  /** Supplied by the operator. When absent one is generated for them. */
  password?: string;
  /** Where a generated password is written, in addition to being logged. */
  passwordFile?: string;
  workspaceName?: string;
  log?: (message: string) => void;
}): Promise<BootstrapResult> {
  const log = options.log ?? ((message: string) => console.log(message));
  const client = new pg.Client({ connectionString: options.connectionString });
  await client.connect();
  try {
    // Two instances starting at once must not both decide they are first.
    await client.query('SELECT pg_advisory_lock(719821009)');
    const { rows } = await client.query('SELECT count(*)::int AS n FROM public.auth_user');
    if (rows[0].n > 0) return { created: false, reason: 'users-exist' };

    // `admin@localhost` is what an operator expects and what the identity
    // library refuses: no dot in the domain, so it fails validation and the
    // documented zero-configuration start created no administrator at all.
    const email = options.email?.trim() || 'admin@passdown.local';
    const password = options.password?.trim() || generatePassword();
    const generated = !options.password?.trim();
    const workspaceName = options.workspaceName?.trim() || 'Workspace';
    const workspaceId = slug(workspaceName);

    // Sign-up is disabled for the running application, and stays that way. This
    // instance exists for one call and never sees a request.
    const identity = createIdentity({
      connectionString: options.connectionString,
      secret: options.secret,
      baseURL: options.baseURL,
      allowSignUp: true,
    });
    try {
      const created = await identity.api.signUpEmail({
        body: { email, password, name: 'Administrator' },
      });
      await client.query(
        'UPDATE public.auth_user SET email_verified=true, must_change_password=true WHERE id=$1',
        [created.user.id],
      );
      // Verified without a verification email because there is no mail server
      // to send one, and the operator who read this password off their own
      // console is the person the address belongs to.
      // Through a function rather than an insert: the running application has
      // no rights over app.workspace and is not being given any. The function
      // refuses once a workspace exists, so the limit is the database's and not
      // this code's to remember.
      await client.query('SELECT app.claim_first_workspace($1,$2,$3)', [
        workspaceId,
        workspaceName,
        created.user.id,
      ]);

      // A workspace comes with the administrator because otherwise there is
      // nothing to administer: nothing in the product creates one, so an
      // installation without this would start empty with no way out of it.
      if (generated && options.passwordFile) {
        try {
          writeFileSync(options.passwordFile, password + '\n', { mode: 0o600 });
          chmodSync(options.passwordFile, 0o600);
        } catch (error) {
          log(`Passdown could not write the password file: ${(error as Error).message}`);
        }
      }
      log(
        generated
          ? `\nPassdown first run.\n  Sign in as ${email}\n  Password: ${password}\n` +
              (options.passwordFile ? `  Also written to ${options.passwordFile}\n` : '') +
              `  You will be asked to change it immediately.\n`
          : `\nPassdown first run.\n  Administrator ${email} created from the configured password.\n` +
              `  You will be asked to change it immediately.\n`,
      );
      return {
        created: true,
        email,
        password: generated ? password : null,
        workspace: workspaceId,
      };
    } finally {
      await identity.close();
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(719821009)').catch(() => {});
    await client.end();
  }
}
