import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { actorSchema, type Actor } from '@guide/core';
import { ApplicationError } from '@guide/contracts';

import type { AdminAccount } from '@guide/contracts';
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
const anonymous: Actor = { kind: 'anonymous' };

/** Account mutations never acquire workspace or roster locks. */
export function credentialStore(pool: pg.Pool) {
  async function transaction<T>(actor: Actor, run: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const who = actorSchema.parse(actor);
    for (let attempt = 0; ; attempt++) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const permission = (
          await c.query(
            "SELECT NOT rolsuper AND NOT rolbypassrls AND rolname='guide_runtime' AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='app.guide'::regclass),'MEMBER') AS safe FROM pg_roles WHERE rolname=current_user",
          )
        ).rows[0];
        if (!permission?.safe) throw new Error('Unsafe application database role configuration.');
        await c.query("SET LOCAL lock_timeout='5s'");
        await c.query(
          "SELECT set_config('guide.actor_id',$1,true),set_config('guide.actor_active',$2,true),set_config('guide.workspace_id','',true),set_config('guide.actor_kind',$3,true)",
          [
            who.kind === 'user' ? who.id : '',
            String(who.kind === 'anonymous' || who.active),
            who.kind,
          ],
        );
        const result = await run(c);
        await c.query('COMMIT');
        return result;
      } catch (e) {
        await c.query('ROLLBACK');
        const code = (e as { code?: string }).code;
        if (code === '40P01' || code === '55P03') {
          if (attempt === 0) continue;
          throw new ApplicationError('BUSY', 'This account is busy. Try again shortly.', 503);
        }
        if (code === '40001')
          throw new ApplicationError(
            'PASSWORD_CHANGED_ELSEWHERE',
            'The password changed while this request was being handled. Sign in again.',
            409,
          );
        if (code === '42501' || code === 'P0002')
          throw new ApplicationError('NOT_FOUND', 'Account not found.', 404);
        if (code === '23514')
          throw new ApplicationError('VALIDATION_ERROR', (e as Error).message, 422);
        throw e;
      } finally {
        c.release();
      }
    }
  }
  return {
    async currentPasswordHash(userId: string): Promise<string | null> {
      return transaction(
        { kind: 'user', id: userId, active: true },
        async (c) =>
          (
            await c.query(
              "SELECT password FROM public.auth_account WHERE user_id=$1 AND provider_id='credential'",
              [userId],
            )
          ).rows[0]?.password ?? null,
      );
    },
    async changeOwnPassword(
      actor: Actor,
      input: { expectedHash: string; newHash: string; keepSessionId: string },
    ): Promise<number> {
      return transaction(actor, async (c) =>
        Number(
          (
            await c.query('SELECT app.change_own_password($1,$2,$3) AS ended', [
              input.expectedHash,
              input.newHash,
              input.keepSessionId,
            ])
          ).rows[0].ended,
        ),
      );
    },
    async describePasswordReset(
      token: string,
    ): Promise<{ userId: string; email: string; name: string; expiresAt: string } | null> {
      if (!tokenPattern.test(token)) return null;
      return transaction(anonymous, async (c) => {
        const r = (await c.query('SELECT * FROM app.describe_password_reset($1)', [digest(token)]))
          .rows[0];
        return r
          ? {
              userId: r.account_id,
              email: r.account_email,
              name: r.account_name,
              expiresAt: new Date(r.reset_expires_at).toISOString(),
            }
          : null;
      });
    },
    async redeemPasswordReset(token: string, passwordHash: string): Promise<string | null> {
      if (!tokenPattern.test(token)) return null;
      return transaction(
        anonymous,
        async (c) =>
          (
            await c.query('SELECT app.redeem_password_reset($1,$2) AS who', [
              digest(token),
              passwordHash,
            ])
          ).rows[0].who,
      );
    },
    async isInstallationAdministrator(actor: Actor): Promise<boolean> {
      return transaction(
        actor,
        async (c) =>
          (await c.query('SELECT app.is_installation_admin() AS allowed')).rows[0].allowed === true,
      );
    },
    async listAccountsForAdministrator(
      actor: Actor,
      query: { q?: string; limit?: number },
    ): Promise<{ accounts: AdminAccount[]; total: number; limit: number }> {
      const q = query.q?.trim() ?? '';
      const limit = query.limit ?? 100;
      if (q.length > 200 || !Number.isInteger(limit) || limit < 1 || limit > 200)
        throw new ApplicationError('VALIDATION_ERROR', 'Invalid account search.', 422);
      return transaction(actor, async (c) => {
        const rows = (await c.query('SELECT * FROM app.admin_list_accounts($1,$2)', [q, limit]))
          .rows;
        return {
          total: Number(rows[0]?.matched ?? 0),
          limit,
          accounts: rows.map((r) => ({
            id: r.account_id,
            name: r.account_name,
            email: r.account_email,
            status: !r.account_active
              ? 'suspended'
              : !r.account_verified
                ? 'unconfirmed'
                : 'active',
            mustChangePassword: r.account_must_change,
            isAdministrator: r.account_is_administrator,
            isYou: actor.kind === 'user' && actor.id === r.account_id,
            workspaces: r.account_workspaces,
            pendingReset: r.pending_expires_at
              ? {
                  expiresAt: new Date(r.pending_expires_at).toISOString(),
                  issuedVia: r.pending_issued_via,
                }
              : null,
          })),
        };
      });
    },
    async adminIssuePasswordReset(
      actor: Actor,
      accountId: string,
    ): Promise<{ token: string; expiresAt: string }> {
      const token = randomBytes(32).toString('base64url');
      return transaction(actor, async (c) => {
        const r = (
          await c.query('SELECT * FROM app.admin_issue_password_reset($1,$2)', [
            accountId,
            digest(token),
          ])
        ).rows[0];
        return { token, expiresAt: new Date(r.reset_expires_at).toISOString() };
      });
    },
    async adminCancelPasswordReset(actor: Actor, accountId: string): Promise<void> {
      await transaction(actor, async (c) => {
        const count = Number(
          (await c.query('SELECT app.admin_cancel_password_reset($1) AS closed', [accountId]))
            .rows[0].closed,
        );
        if (!count)
          throw new ApplicationError(
            'NOT_FOUND',
            'There is no reset link waiting for this account.',
            404,
          );
      });
    },
  };
}
