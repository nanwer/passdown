import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createApplicationStore } from '../src/store';
import { createIdentity } from '../src/identity';
import { hashCredentialPassword } from '../src/credentials';
import { issueOperatorPasswordReset } from '../src/password-reset';

type Check = (name: string, fn: () => Promise<void>) => Promise<void>;

/**
 * Account boundaries that sit below the web routes: who an administrator may
 * reset, and whether a suspended account can obtain a session. Every account
 * here is created for the check, so the order of other checks is irrelevant.
 */
export async function verifyAccountSecurity(
  check: Check,
  input: { ownerURL: string; runtimeURL: string; secret: string },
) {
  const owner = new pg.Pool({ connectionString: input.ownerURL, max: 1 });
  const store = createApplicationStore({ connectionString: input.runtimeURL });
  const suffix = randomUUID().slice(0, 8);
  async function account(id: string, password: string, active = true) {
    const email = `${id}@test.local`;
    await owner.query(
      'INSERT INTO public.auth_user(id,name,email,email_verified,active) VALUES($1,$2,$3,true,$4)',
      [id, id, email, active],
    );
    await owner.query(
      "INSERT INTO public.auth_account(id,account_id,provider_id,user_id,password) VALUES($1,$1,'credential',$1,$2)",
      [id, await hashCredentialPassword(password)],
    );
    return email;
  }
  try {
    await check(
      'an administrator cannot create a reset link for another administrator; the operator still can',
      async () => {
        const password = 'Integration-only-' + randomUUID();
        const first = `admin-first-${suffix}`,
          second = `admin-second-${suffix}`,
          member = `admin-member-${suffix}`;
        await account(first, password);
        const secondEmail = await account(second, password);
        await account(member, password);
        for (const email of [`${first}@test.local`, secondEmail])
          assert.equal(
            (await owner.query('SELECT * FROM app.operator_grant_administrator($1)', [email]))
              .rows[0].outcome,
            'granted',
          );
        const actor = { kind: 'user' as const, id: first, active: true };
        await assert.rejects(store.adminIssuePasswordReset(actor, second), (e: any) => {
          assert.equal(e.status, 422);
          assert.match(
            e.message,
            /Another installation administrator's password can only be reset from the server/,
          );
          assert.ok(
            e.message.includes(`docker compose run --rm ops reset-password --email ${secondEmail}`),
            e.message,
          );
          return true;
        });
        // Refused before anything is written: no link, no audit entry.
        assert.equal(
          (
            await owner.query(
              "SELECT (SELECT count(*) FROM app.password_reset WHERE user_id=$1) + (SELECT count(*) FROM app.account_audit WHERE target_user_id=$1 AND action='account.password_reset_issued') AS n",
              [second],
            )
          ).rows[0].n,
          '0',
        );
        // Ordinary accounts are unaffected.
        assert.match((await store.adminIssuePasswordReset(actor, member)).token, /^[\w-]{43}$/);
        // The server command still resets an administrator.
        const operator = await issueOperatorPasswordReset({
          ownerDatabaseURL: input.ownerURL,
          origin: 'http://127.0.0.1:3101',
          email: secondEmail,
        });
        assert.equal(operator.kind, 'issued');
      },
    );
    await check(
      "a suspended account's correct password fails like a wrong one and creates no session",
      async () => {
        const identity = createIdentity({
          connectionString: input.runtimeURL,
          secret: input.secret,
          baseURL: 'http://127.0.0.1:3101',
        });
        const password = 'Integration-only-' + randomUUID();
        const id = `suspended-login-${suffix}`;
        const email = await account(id, password, false);
        const attempt = async (value: string) => {
          const response = await identity.handler(
            new Request('http://127.0.0.1:3101/api/auth/sign-in/email', {
              method: 'POST',
              headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3101' },
              body: JSON.stringify({ email, password: value }),
            }),
          );
          return {
            status: response.status,
            body: await response.json(),
            cookie: response.headers.get('set-cookie'),
          };
        };
        const sessions = async () =>
          (await owner.query('SELECT count(*) FROM public.auth_session WHERE user_id=$1', [id]))
            .rows[0].count;
        try {
          const wrong = await attempt(password + '-wrong');
          const suspended = await attempt(password);
          assert.equal(wrong.status, 401);
          assert.deepEqual(suspended, wrong);
          assert.equal(await sessions(), '0');
          // The same password works once the account is reinstated.
          await owner.query('UPDATE public.auth_user SET active=true WHERE id=$1', [id]);
          const reinstated = await attempt(password);
          assert.equal(reinstated.status, 200);
          assert.equal(await sessions(), '1');
        } finally {
          await identity.close();
        }
      },
    );
  } finally {
    await store.close();
    await owner.end();
  }
}
