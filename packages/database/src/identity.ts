import { betterAuth } from 'better-auth';
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
