import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { ConfigurationError } from './config';

type Environment = Record<string, string | undefined>;

/**
 * Settings the Docker install passes as files rather than values.
 *
 * The compose file keeps no secrets: a one-shot `passdown init-secrets`
 * writes them into private volumes, and each service names the files it may
 * read. Web is given only the runtime password and the session secret; the
 * owner password reaches PostgreSQL, the migration job and operator commands.
 *
 * - `GUIDE_DB_OWNER_PASSWORD_FILE` → `GUIDE_OWNER_DATABASE_URL`
 * - `GUIDE_DB_RUNTIME_PASSWORD_FILE` → `GUIDE_DATABASE_URL`
 * - `BETTER_AUTH_SECRET_FILE` → `BETTER_AUTH_SECRET`
 * - `PASSDOWN_URL` → `BETTER_AUTH_URL`
 *
 * Database addresses use `PASSDOWN_DATABASE_HOST` (default `postgres`), port
 * 5432 and database `guide_app`. A file setting cannot be combined with the
 * value it produces: two sources for one secret is a mistake to report, not to
 * resolve silently. The normal validation of every produced value still runs
 * afterwards. Error messages name variables, never file contents.
 */
export const secretFileVariables = [
  'GUIDE_DB_OWNER_PASSWORD_FILE',
  'GUIDE_DB_RUNTIME_PASSWORD_FILE',
  'BETTER_AUTH_SECRET_FILE',
] as const;

export function resolveSecretFiles(
  env: Environment,
  read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): Environment {
  const resolved: Environment = { ...env };
  const secret = (variable: (typeof secretFileVariables)[number]) => {
    const path = env[variable];
    if (!path) return undefined;
    if (!isAbsolute(path)) throw new ConfigurationError(variable, 'must be an absolute file path.');
    let value: string;
    try {
      value = read(path);
    } catch {
      throw new ConfigurationError(
        variable,
        'names a file that cannot be read. Check that the secrets volume is mounted and that the init service completed.',
      );
    }
    value = value.replace(/\r?\n$/, '');
    if (!value || /\s/.test(value))
      throw new ConfigurationError(variable, 'must name a file holding one value on one line.');
    return value;
  };
  const exclusive = (fileVariable: string, produced: string) => {
    if (env[fileVariable] && env[produced])
      throw new ConfigurationError(
        fileVariable,
        `cannot be combined with ${produced}. Set only one of them.`,
      );
  };
  const host = env.PASSDOWN_DATABASE_HOST || 'postgres';
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(host))
    throw new ConfigurationError('PASSDOWN_DATABASE_HOST', 'must be a host name.');
  const database = (role: string, password: string) =>
    `postgresql://${role}:${encodeURIComponent(password)}@${host}:5432/guide_app`;

  exclusive('GUIDE_DB_OWNER_PASSWORD_FILE', 'GUIDE_OWNER_DATABASE_URL');
  exclusive('GUIDE_DB_RUNTIME_PASSWORD_FILE', 'GUIDE_DATABASE_URL');
  exclusive('BETTER_AUTH_SECRET_FILE', 'BETTER_AUTH_SECRET');
  if (env.PASSDOWN_URL && env.BETTER_AUTH_URL && env.PASSDOWN_URL !== env.BETTER_AUTH_URL)
    throw new ConfigurationError(
      'PASSDOWN_URL',
      'cannot differ from BETTER_AUTH_URL. Set only one.',
    );

  const owner = secret('GUIDE_DB_OWNER_PASSWORD_FILE');
  if (owner !== undefined) resolved.GUIDE_OWNER_DATABASE_URL = database('guide_owner', owner);
  const runtime = secret('GUIDE_DB_RUNTIME_PASSWORD_FILE');
  if (runtime !== undefined) resolved.GUIDE_DATABASE_URL = database('guide_runtime', runtime);
  const session = secret('BETTER_AUTH_SECRET_FILE');
  if (session !== undefined) resolved.BETTER_AUTH_SECRET = session;
  if (env.PASSDOWN_URL) resolved.BETTER_AUTH_URL = env.PASSDOWN_URL;
  // Resolved once: the file settings are replaced by the values they produced.
  for (const variable of secretFileVariables) delete resolved[variable];
  return resolved;
}

/**
 * Resolve file settings into this process's environment, in place. A problem
 * leaves the environment unchanged, so the configuration checks that run next
 * report it by variable name instead of starting with half the settings.
 */
export function applySecretFiles(env: Environment = process.env): ConfigurationError | null {
  let resolved: Environment;
  try {
    resolved = resolveSecretFiles(env);
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  for (const variable of secretFileVariables) delete env[variable];
  for (const [key, value] of Object.entries(resolved)) if (value !== undefined) env[key] = value;
  return null;
}
