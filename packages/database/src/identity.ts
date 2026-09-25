import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './auth-schema';
import {
  authSecret,
  identityOrigin,
  pgClientConfig,
  runtimeDatabaseTarget,
  type ConnectionPolicy,
} from './config';
/**
 * The library's refusal for a wrong password, word for word. Anything else
 * that refuses a sign-in after the password is checked sends this, so the
 * response cannot tell the two apart.
 */
const wrongPassword = {
  code: 'INVALID_EMAIL_OR_PASSWORD',
  message: 'Invalid email or password',
};
export function createIdentity(options: {
  connectionString: string;
  secret: string;
  baseURL: string;
  allowSignUp?: boolean;
  policy?: ConnectionPolicy;
}) {
  authSecret(options.secret);
  const baseURL = identityOrigin(options.baseURL, options.policy);
  const pool = new pg.Pool({
    ...pgClientConfig(runtimeDatabaseTarget(options.connectionString, options.policy)),
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
  const auth = betterAuth({
    secret: options.secret,
    baseURL,
    trustedOrigins: [baseURL],
    advanced: { useSecureCookies: baseURL.startsWith('https://') },
    database: drizzleAdapter(drizzle(pool, { schema }), { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignUp,
      requireEmailVerification: true,
    },
    session: { cookieCache: { enabled: false } },
    databaseHooks: {
      session: {
        create: {
          // A suspended account keeps its password, and the library issues a
          // session to any verified account whose password matches. Every
          // session is created here, so this is the one place to refuse it,
          // whichever route asked. The password has already been checked, so
          // the refusal costs the same as a wrong password and reads the same:
          // it reveals neither the suspension nor that the password was right.
          before: async (session) => {
            const account = await pool.query<{ active: boolean }>(
              'SELECT active FROM public.auth_user WHERE id = $1',
              [session.userId],
            );
            if (account.rows[0]?.active !== true) throw new APIError('UNAUTHORIZED', wrongPassword);
          },
        },
      },
    },
    user: {
      additionalFields: {
        active: { type: 'boolean', defaultValue: true, input: false },
        // Set when an account is created for someone rather than by them — the
        // first-run administrator, and later anyone who accepts an invitation.
        // input: false so it can never be set by a request body.
        mustChangePassword: { type: 'boolean', defaultValue: false, input: false },
      },
    },
    rateLimit: { enabled: false },
  });
  return Object.assign(auth, { close: () => pool.end() });
}
