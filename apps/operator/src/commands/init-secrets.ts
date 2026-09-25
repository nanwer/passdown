import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  chownSync,
  closeSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { OperatorFailure, type OperatorCommand } from '../command';

/** The image's unprivileged user, and the group PostgreSQL's image runs as. */
const passdownUser = 10001;
const passdownGroup = 10001;
const postgresGroup = 70;

type Secret = { name: string; dir: 'ownerDir' | 'appDir'; bytes: number };
const secrets: Secret[] = [
  // Read by PostgreSQL (group) and by the migration and operator commands (owner).
  { name: 'database-owner-password', dir: 'ownerDir', bytes: 32 },
  // Read by web, and by the migration job, which sets the role's password.
  { name: 'database-runtime-password', dir: 'appDir', bytes: 32 },
  { name: 'session-secret', dir: 'appDir', bytes: 48 },
];

/**
 * Write the installation's secrets into their volumes on first start.
 *
 * Existing secrets are never replaced: the database was initialised with the
 * owner password and replacing it would lock the installation out. Each file
 * is written beside its final name, flushed, then hard-linked into place, so
 * an interrupted start never leaves a truncated secret that a later start
 * would keep. Running as root (the one-shot init service), it also hands the
 * files to the users that read them; otherwise it only sets their modes.
 */
export async function initSecrets(options: {
  ownerDir: string;
  appDir: string;
}): Promise<{ created: string[]; kept: string[] }> {
  const root = process.getuid?.() === 0;
  const own = (path: string, group: number) => {
    if (root) chownSync(path, passdownUser, group);
  };
  for (const [dir, group, mode] of [
    [options.ownerDir, postgresGroup, 0o750],
    [options.appDir, passdownGroup, 0o700],
  ] as const) {
    let info;
    try {
      info = lstatSync(dir);
    } catch {
      throw new OperatorFailure(`The secrets volume at ${dir} is not mounted.`);
    }
    if (!info.isDirectory())
      throw new OperatorFailure(`The secrets volume at ${dir} is not a directory.`);
    own(dir, group);
    chmodSync(dir, mode);
  }
  const created: string[] = [];
  const kept: string[] = [];
  for (const secret of secrets) {
    const dir = options[secret.dir];
    const path = join(dir, secret.name);
    const group = secret.dir === 'ownerDir' ? postgresGroup : passdownGroup;
    const mode = secret.dir === 'ownerDir' ? 0o440 : 0o400;
    let existing;
    try {
      existing = lstatSync(path);
    } catch {
      existing = null;
    }
    if (existing) {
      if (!existing.isFile()) throw new OperatorFailure(`${secret.name} is not a regular file.`);
      if (existing.size === 0)
        throw new OperatorFailure(
          `${secret.name} is empty. Restore it from your records; a new value would not match the database.`,
        );
      own(path, group);
      chmodSync(path, mode);
      kept.push(secret.name);
      continue;
    }
    const partial = join(dir, `.${secret.name}.${process.pid}.partial`);
    const descriptor = openSync(partial, 'wx', 0o600);
    try {
      writeSync(descriptor, `${randomBytes(secret.bytes).toString('hex')}\n`);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    try {
      own(partial, group);
      chmodSync(partial, mode);
      linkSync(partial, path);
    } finally {
      unlinkSync(partial);
    }
    created.push(secret.name);
  }
  return { created, kept };
}

export const initSecretsCommand: OperatorCommand = {
  name: 'init-secrets',
  summary: 'Create the database passwords and session secret on first start; keep existing ones.',
  usage: 'init-secrets [--owner-dir DIR] [--app-dir DIR]',
  options: { 'owner-dir': { type: 'string' }, 'app-dir': { type: 'string' } },
  needs: [],
  async run(input, context) {
    const result = await initSecrets({
      ownerDir: String(input.options['owner-dir'] ?? '/run/passdown/owner'),
      appDir: String(input.options['app-dir'] ?? '/run/passdown/app'),
    });
    context.out(
      result.created.length
        ? `Created ${result.created.length} secrets; kept ${result.kept.length} existing.`
        : 'Secrets already exist; nothing was changed.',
    );
  },
};
