import {
  formatOperatorExpiry,
  grantInstallationAdministrator,
  issueOperatorPasswordReset,
  listInstallationAdministrators,
  revokeInstallationAdministrator,
} from '@guide/database';
import { OperatorFailure, type OperatorCommand } from '../command';

/** The fallback when no installation administrator can sign in. */
export const resetPasswordCommand: OperatorCommand = {
  name: 'reset-password',
  summary: 'Create a single-use, 24-hour password reset link for any account.',
  usage: 'reset-password --email ADDRESS',
  options: { email: { type: 'string', required: true } },
  needs: ['owner', 'origin'],
  async run(input, context) {
    const result = await issueOperatorPasswordReset({
      ownerDatabaseURL: context.ownerURL!,
      policy: context.policy,
      origin: context.origin!,
      email: String(input.options.email),
    });
    if (result.kind === 'refused')
      throw new OperatorFailure(result.message, result.reason === 'schema-behind' ? 1 : 4);
    context.info(
      `Reset link for ${result.email}, valid until ${formatOperatorExpiry(result.expiresAt)}.`,
    );
    context.info('Pass it on privately. Using it signs the account out everywhere.');
    // The link alone on stdout, so it can be copied or piped without the notes.
    context.out(result.link);
  },
};

const subcommands = ['grant', 'revoke', 'list'];
export const adminCommand: OperatorCommand = {
  name: 'admin',
  summary: 'Grant, revoke or list installation administrators.',
  usage: 'admin grant EMAIL | admin revoke EMAIL | admin list',
  arguments: { min: 1, max: 2 },
  validate: ({ args }) =>
    subcommands.includes(args[0]!) && (args[0] === 'list' ? args.length === 1 : args.length === 2),
  needs: ['owner'],
  async run(input, context) {
    const [action, email] = input.args;
    const target = { ownerDatabaseURL: context.ownerURL!, policy: context.policy };
    if (action === 'list') {
      for (const admin of await listInstallationAdministrators(target))
        context.out(
          `${admin.email}\t${admin.grantedVia}\t${admin.grantedAt.toISOString().slice(0, 10)}`,
        );
      return;
    }
    if (action === 'grant') {
      const result = await grantInstallationAdministrator({ ...target, email: email! });
      if (result.outcome === 'refused') throw new OperatorFailure(result.message, 4);
      context.out(
        result.outcome === 'already'
          ? `${result.email} is already an installation administrator.`
          : `${result.email} is now an installation administrator.`,
      );
      return;
    }
    const result = await revokeInstallationAdministrator({ ...target, email: email! });
    if (result.outcome === 'refused') throw new OperatorFailure(result.message, 4);
    context.out(
      `${result.email} is no longer an installation administrator. ${result.remaining} remain.`,
    );
  },
};
