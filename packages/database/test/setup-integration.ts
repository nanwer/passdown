import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate, requireLocal } from '../../../scripts/migrate-local.mjs';
import { readConfig } from '../../../scripts/local-config.mjs';
import { completeSetup, reconcileSetup, setupRequired } from '../src/setup';
import { createIdentity } from '../src/identity';
import { createApplicationStore } from '../src/store';
import { runtimeRoleIsSafeFor } from '../src/runtime-role';
import { verifyCredentialPassword } from '../src/credentials';
export async function verifySetup(check: (name: string, fn: () => Promise<void>) => Promise<void>) {
  const config = readConfig();
  const owner = new URL(config.GUIDE_OWNER_DATABASE_URL);
  const runtime = new URL(config.GUIDE_DATABASE_URL);
  owner.pathname = runtime.pathname = '/guide_app_setup_test';
  requireLocal(owner.href, 'guide_app_setup_test');
  const adminURL = new URL(owner);
  adminURL.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminURL.href });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS guide_app_setup_test WITH (FORCE)');
  await admin.query('CREATE DATABASE guide_app_setup_test');
  await admin.end();
  await migrate(owner.href, runtime.href);
  const db = new pg.Client({ connectionString: owner.href });
  await db.connect();
  const pool = new pg.Pool({ connectionString: runtime.href });
  const identity = createIdentity({
    connectionString: runtime.href,
    secret: 's'.repeat(48),
    baseURL: 'http://127.0.0.1:3100',
    allowSignUp: true,
  });
  const store = createApplicationStore({ connectionString: runtime.href });
  const input = {
    email: 'Owner@Example.org',
    name: 'Owner',
    password: 'a long synthetic test password',
    workspaceName: 'Workshop',
  };
  const clear = async () => {
    await db.query('TRUNCATE app.workspace, public.auth_user CASCADE');
  };
  const counts = async () =>
    (
      await db.query(
        'SELECT (SELECT count(*)::int FROM public.auth_user) AS users,(SELECT count(*)::int FROM public.auth_account) AS accounts,(SELECT count(*)::int FROM app.workspace) AS workspaces',
      )
    ).rows[0];
  try {
    await check('setup creates a usable canonical account and workspace atomically', async () => {
      assert.equal(await setupRequired(pool), true);
      const created = await completeSetup(pool, input);
      assert.equal(created.outcome, 'created');
      assert.deepEqual(await counts(), { users: 1, accounts: 1, workspaces: 1 });
      const user = (
        await db.query('SELECT email,email_verified,must_change_password FROM public.auth_user')
      ).rows[0];
      assert.deepEqual(user, {
        email: 'owner@example.org',
        email_verified: true,
        must_change_password: false,
      });
      for (const email of ['Owner@Example.org', 'owner@example.org']) {
        const signed = await identity.api.signInEmail({
          body: { email, password: input.password },
        });
        assert.equal(signed.user.email, 'owner@example.org');
      }
      const signedUp = await identity.api.signUpEmail({
        body: { email: 'adapter@example.org', password: input.password, name: 'Adapter' },
      });
      const credential = (
        await db.query('SELECT password FROM public.auth_account WHERE user_id=$1', [
          signedUp.user.id,
        ])
      ).rows[0];
      assert.equal(
        await verifyCredentialPassword({ password: input.password, hash: credential.password }),
        true,
      );
      assert.equal((await completeSetup(pool, input)).outcome, 'already-set-up');
    });
    await check('three concurrent submissions create only one installation', async () => {
      await clear();
      const results = await Promise.all([1, 2, 3].map(() => completeSetup(pool, input)));
      assert.equal(results.filter((r) => r.outcome === 'created').length, 1);
      assert.equal(results.filter((r) => r.outcome === 'already-set-up').length, 2);
      assert.deepEqual(await counts(), { users: 1, accounts: 1, workspaces: 1 });
    });
    await check(
      'a failed final step or pre-existing workspace rolls back the account',
      async () => {
        await clear();
        assert.equal(
          (
            await completeSetup(pool, input, {
              finalStep: async () => {
                throw Error('injected');
              },
            })
          ).outcome,
          'rolled-back',
        );
        assert.deepEqual(await counts(), { users: 0, accounts: 0, workspaces: 0 });
        await db.query(
          "INSERT INTO app.workspace(id,name,audience) VALUES('existing','Existing','public')",
        );
        assert.equal((await completeSetup(pool, input)).outcome, 'workspace-exists');
        assert.deepEqual(await counts(), { users: 0, accounts: 0, workspaces: 1 });
      },
    );
    for (const send of [true, false])
      await check(
        `uncertain commit reconciles correctly when COMMIT was ${send ? 'sent' : 'not sent'}`,
        async () => {
          await clear();
          const wrapped = {
            connect: async () => {
              const client = await pool.connect();
              return {
                query: async (sql: string, values?: unknown[]) => {
                  if (sql === 'COMMIT') {
                    if (send) await client.query(sql);
                    throw Error('simulated lost connection');
                  }
                  return client.query(sql, values);
                },
                release: (destroy?: boolean) => client.release(destroy),
              };
            },
          } as unknown as pg.Pool;
          assert.equal((await completeSetup(wrapped, input)).outcome, 'uncertain');
          assert.equal(await reconcileSetup(pool, input.email), send ? 'complete' : 'empty');
          if (send)
            assert.equal(
              (
                await identity.api.signInEmail({
                  body: { email: input.email, password: input.password },
                })
              ).user.email,
              'owner@example.org',
            );
        },
      );
    await check('reconciliation waits for an in-flight setup transaction', async () => {
      await clear();
      const pending = await pool.connect();
      await pending.query('BEGIN');
      await pending.query('SELECT pg_advisory_xact_lock(719821009)');
      await pending.query(
        "INSERT INTO public.auth_user(id,name,email,email_verified) VALUES('pending','Pending','owner@example.org',true)",
      );
      let finished = false;
      const reconciliation = reconcileSetup(pool, input.email).then((value) => {
        finished = true;
        return value;
      });
      try {
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(finished, false);
        await pending.query('COMMIT');
        assert.equal(await reconciliation, 'complete');
      } finally {
        await pending.query('ROLLBACK');
        pending.release();
      }
    });
    await check('health and transactions both refuse owner membership', async () => {
      await db.query('GRANT guide_owner TO guide_runtime');
      try {
        assert.equal((await db.query(runtimeRoleIsSafeFor('guide_runtime'))).rows[0].safe, false);
        assert.equal(await store.health(), false);
        await assert.rejects(() => store.listWorkspaces({ kind: 'anonymous' }));
      } finally {
        await db.query('REVOKE guide_owner FROM guide_runtime');
      }
      assert.equal(await store.health(), true);
      assert.equal((await db.query(runtimeRoleIsSafeFor('guide_runtime'))).rows[0].safe, true);
    });
  } finally {
    await identity.close();
    await store.close();
    await pool.end();
    await db.end();
    const cleanup = new pg.Client({ connectionString: adminURL.href });
    await cleanup.connect();
    await cleanup.query('DROP DATABASE guide_app_setup_test WITH (FORCE)');
    await cleanup.end();
  }
}
