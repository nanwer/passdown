export type ConnectionPolicy = 'loopback' | 'deployment';
export class ConfigurationError extends Error {
  constructor(
    readonly variable: string,
    message: string,
  ) {
    super(`${variable}: ${message}`);
    this.name = 'ConfigurationError';
  }
}
export type DatabaseTarget = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};
const loopback = (host: string) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
export function parseDatabaseURL(
  value: string | undefined,
  variable: string,
  policy: ConnectionPolicy,
): DatabaseTarget {
  const fail = (message: string): never => {
    throw new ConfigurationError(variable, message);
  };
  if (!value) return fail('is not set.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail('must be a PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    return fail('must be a PostgreSQL URL.');
  if (url.search || url.hash || value.includes('?') || value.includes('#'))
    return fail(
      'must not carry query options; use postgresql://user:password@host:port/database only.',
    );
  let user: string, password: string, database: string;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
    database = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return fail('contains invalid URL encoding.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host.includes(',') || /[%\s]/.test(host))
    return fail('must name exactly one database host.');
  if (!database || database.includes('/') || database.includes('\0'))
    return fail('must end with one database name, such as /guide_app.');
  if (!user || user.includes('\0') || password.includes('\0'))
    return fail('must include valid database credentials.');
  if (policy === 'loopback' && !loopback(host))
    return fail('Database must use a loopback PostgreSQL URL.');
  if (policy === 'deployment' && !password) return fail('must include a password.');
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fail('must use a valid port.');
  return { host, port, database, user, password };
}
export function runtimeDatabaseTarget(
  value: string | undefined,
  policy: ConnectionPolicy = 'loopback',
  variable = 'GUIDE_DATABASE_URL',
) {
  const target = parseDatabaseURL(value, variable, policy);
  if (target.user !== 'guide_runtime')
    throw new ConfigurationError(
      variable,
      'Application connections require the nonowner guide_runtime role.',
    );
  return target;
}
export function ownerDatabaseTarget(
  value: string | undefined,
  policy: ConnectionPolicy = 'loopback',
  variable = 'GUIDE_OWNER_DATABASE_URL',
) {
  const target = parseDatabaseURL(value, variable, policy);
  if (target.user === 'guide_runtime')
    throw new ConfigurationError(variable, 'requires an owner role.');
  return target;
}
export function pgClientConfig(target: DatabaseTarget) {
  // pg ignores empty-string overrides and otherwise falls back to PG* variables.
  // A whitespace-only options string is a neutral, truthy startup value.
  return {
    ...target,
    ssl: false as const,
    options: ' ',
    application_name: 'passdown',
    client_encoding: 'UTF8',
    replication: 'false',
    sslnegotiation: 'postgres' as const,
    connectionTimeoutMillis: 10_000,
  };
}
/** Use as the complete set of PG variables, never merge ambient PG options. */
export function libpqEnvironment(t: DatabaseTarget): Record<string, string> {
  return {
    PGHOST: t.host,
    PGPORT: String(t.port),
    PGDATABASE: t.database,
    PGUSER: t.user,
    PGPASSWORD: t.password,
    PGSSLMODE: 'disable',
    PGCONNECT_TIMEOUT: '10',
  };
}
export function identityOrigin(
  value: string | undefined,
  policy: ConnectionPolicy = 'loopback',
  variable = 'BETTER_AUTH_URL',
): string {
  const fail = (): never => {
    throw new ConfigurationError(
      variable,
      policy === 'loopback'
        ? 'Identity baseURL must be a loopback origin.'
        : 'must be a bare origin and use https:// unless it is a loopback address.',
    );
  };
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    return fail();
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    return fail();
  if ((policy === 'loopback' || url.protocol === 'http:') && !loopback(url.hostname)) return fail();
  return url.origin;
}
export function authSecret(value: string | undefined, variable = 'BETTER_AUTH_SECRET'): string {
  if (!value || value.length < 32)
    throw new ConfigurationError(variable, 'Identity secret must be at least 32 characters.');
  return value;
}
export function describeDatabaseTarget(t: DatabaseTarget): string {
  return `${t.host.includes(':') ? `[${t.host}]` : t.host}:${t.port}/${t.database}`;
}
