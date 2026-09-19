import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './auth-schema';
import { localDatabaseURL, localOrigin } from './config';
export function createIdentity(options: {
  connectionString: string;
  secret: string;
  baseURL: string;
  allowSignUp?: boolean;
}) {
  if (options.secret.length < 32)
    throw new Error('Identity secret must be at least 32 characters. Run pnpm local:setup.');
  const baseURL = localOrigin(options.baseURL);
  const pool = new pg.Pool({
    connectionString: localDatabaseURL(options.connectionString),
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
  const auth = betterAuth({
    secret: options.secret,
    baseURL,
    trustedOrigins: [baseURL],
    database: drizzleAdapter(drizzle(pool, { schema }), { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !options.allowSignUp,
      requireEmailVerification: true,
    },
    session: { cookieCache: { enabled: false } },
    user: { additionalFields: { active: { type: 'boolean', defaultValue: true, input: false } } },
    rateLimit: { enabled: false },
  });
  return Object.assign(auth, { close: () => pool.end() });
}
