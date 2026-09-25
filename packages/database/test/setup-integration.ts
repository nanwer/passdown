import assert from 'node:assert/strict';
import pg from 'pg';
import { migrate, requireLocal } from '../../../scripts/migrate-local.mjs';
import { readConfig } from '../../../scripts/local-config.mjs';
import {
  defaultLoginEmail,
  defaultLoginPassword,
  ensureDefaultLogin,
  setupState,
  setupStateAsOwner,
} from '../src/setup';
import { createIdentity } from '../src/identity';
import { createApplicationStore } from '../src/store';
import { runtimeRoleIsSafeFor } from '../src/runtime-role';
import { hashCredentialPassword, verifyCredentialPassword } from '../src/credentials';
import { issueOperatorPasswordReset } from '../src/password-reset';

/**
 * The default login: created once, only in an empty database, by the operator
 * connection; replaced by Finish setting up, in one transaction, by the
 * signed-in default account through the runtime role.
 */
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
  });
  const store = createApplicationStore({ connectionString: runtime.href });
  const clear = async () => {
    await db.query('TRUNCATE app.workspace, public.auth_user, app.account_audit CASCADE');
  };
  const counts = async () =>
    (
      await db.query(
        'SELECT (SELECT count(*)::int FROM public.auth_user) AS users,(SELECT count(*)::int FROM public.auth_account) AS accounts,(SELECT count(*)::int FROM app.workspace) AS workspaces,(SELECT count(*)::int FROM app.default_login) AS defaults',
      )
    ).rows[0];
  const signIn = async (email: string, password: string) => {
    try {
      const signed = await identity.api.signInEmail({ body: { email, password } });
      return signed.user.email;
    } catch {
      return null;
    }
  };
  // A signed-in default login, as the web application sees it.
  const defaultSession = async () => {
    const signed = await identity.api.signInEmail({
      body: { email: defaultLoginEmail, password: defaultLoginPassword },
      asResponse: true,
    });
    assert.equal(signed.ok, true);
    const cookie = signed.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const session = await identity.api.getSession({ headers: new Headers({ cookie }) });
    assert.ok(session);
    return session;
  };
  const finish = {
    name: 'Owner',
    email: 'owner@example.org',
    password: 'a long synthetic test password',
    workspaceName: 'Workshop',
  };
  try {
    await check('a fresh database gets one default login, usable for sign-in', async () => {
      assert.equal(await setupStateAsOwner(owner.href), 'no-account');
      assert.equal(await setupState(pool), 'no-account');
      assert.equal(await ensureDefaultLogin(owner.href), 'created');
      assert.deepEqual(await counts(), { users: 1, accounts: 1, workspaces: 0, defaults: 1 });
      const user = (
        await db.query(
          'SELECT u.id,u.name,u.email,u.email_verified,u.active,u.must_change_password,a.granted_via FROM public.auth_user u JOIN app.installation_admin a ON a.user_id=u.id',
        )
      ).rows[0];
      assert.deepEqual(
        { ...user, id: undefined },
        {
          id: undefined,
          name: 'Administrator',
          email: 'admin@example.com',
          email_verified: true,
          active: true,
          must_change_password: true,
          granted_via: 'setup',
        },
      );
      assert.equal(await store.defaultLoginAccount(), user.id);
      assert.equal(await setupState(pool), 'default-login');
      assert.equal(await setupStateAsOwner(owner.href), 'default-login');
      assert.equal(await signIn(defaultLoginEmail, defaultLoginPassword), defaultLoginEmail);
      assert.deepEqual(
        (
          await db.query(
            'SELECT action,actor_kind FROM app.account_audit WHERE target_user_id=$1 ORDER BY action',
            [user.id],
          )
        ).rows,
        [
          { action: 'account.admin_granted', actor_kind: 'operator' },
          { action: 'account.default_login_created', actor_kind: 'operator' },
        ],
      );
    });
    await check('creating the default login is idempotent and race-safe', async () => {
      assert.equal(await ensureDefaultLogin(owner.href), 'not-needed');
      await clear();
      const results = await Promise.all([1, 2, 3, 4].map(() => ensureDefaultLogin(owner.href)));
      assert.deepEqual(results.sort(), ['created', 'not-needed', 'not-needed', 'not-needed']);
      assert.deepEqual(await counts(), { users: 1, accounts: 1, workspaces: 0, defaults: 1 });
    });
    await check('a database with any account or workspace never gets a default login', async () => {
      await clear();
      await db.query(
        "INSERT INTO public.auth_user(id,name,email,email_verified,active) VALUES('restored','Restored','restored@example.org',true,true)",
      );
      assert.equal(await ensureDefaultLogin(owner.href), 'not-needed');
      assert.equal(await setupState(pool), 'complete');
      assert.deepEqual(await counts(), { users: 1, accounts: 0, workspaces: 0, defaults: 0 });
      await clear();
      await db.query(
        "INSERT INTO app.workspace(id,name,audience) VALUES('existing','Existing','public')",
      );
      assert.equal(await ensureDefaultLogin(owner.href), 'not-needed');
      assert.equal(await setupState(pool), 'no-account');
      assert.deepEqual(await counts(), { users: 0, accounts: 0, workspaces: 1, defaults: 0 });
      // The runtime role cannot create one, even by calling the function.
      await clear();
      await assert.rejects(
        pool.query('SELECT app.operator_create_default_login($1)', [
          await hashCredentialPassword('changeme'),
        ]),
        (error: { code?: string }) => error.code === '42501',
      );
      assert.deepEqual(await counts(), { users: 0, accounts: 0, workspaces: 0, defaults: 0 });
    });
    await check('only Finish setting up can replace the default password', async () => {
      await clear();
      await ensureDefaultLogin(owner.href);
      const session = await defaultSession();
      const actor = { kind: 'user', id: session.user.id, active: true } as const;
      const stored = await store.currentPasswordHash(session.user.id);
      await assert.rejects(
        store.changeOwnPassword(actor, {
          expectedHash: stored!,
          newHash: await hashCredentialPassword('another long password'),
          keepSessionId: session.session.id,
        }),
        (error: { status?: number; message?: string }) =>
          error.status === 422 && /finish setting up/i.test(error.message ?? ''),
      );
      const reset = await issueOperatorPasswordReset({
        ownerDatabaseURL: owner.href,
        origin: 'https://localhost:8443',
        email: defaultLoginEmail,
      });
      assert.equal(reset.kind === 'refused' && reset.reason, 'default-login');
      // Not even the owner connection writes it directly.
      await assert.rejects(
        db.query(
          "UPDATE public.auth_account SET password=$1 WHERE user_id=$2 AND provider_id='credential'",
          [await hashCredentialPassword('another long password'), session.user.id],
        ),
        (error: { code?: string }) => error.code === '23514',
      );
      assert.equal(await signIn(defaultLoginEmail, defaultLoginPassword), defaultLoginEmail);
      assert.equal(await setupState(pool), 'default-login');
    });
    await check('Finish setting up refuses the default address and other accounts', async () => {
      await clear();
      await ensureDefaultLogin(owner.href);
      const session = await defaultSession();
      const actor = { kind: 'user', id: session.user.id, active: true } as const;
      for (const email of ['admin@example.com', 'Admin@Example.com'])
        await assert.rejects(
          store.finishSetup(actor, {
            ...finish,
            email,
            keepSessionId: session.session.id,
          }),
          (error: { status?: number; message?: string }) =>
            error.status === 422 && /admin@example\.com/.test(error.message ?? ''),
        );
      await db.query(
        "INSERT INTO public.auth_user(id,name,email,email_verified,active) VALUES('other','Other','other@example.org',true,true)",
      );
      await assert.rejects(
        store.finishSetup(
          { kind: 'user', id: 'other', active: true },
          { ...finish, keepSessionId: 'none' },
        ),
        (error: { status?: number }) => error.status === 404,
      );
      assert.equal(await setupState(pool), 'default-login');
      assert.equal(
        (await db.query('SELECT email FROM public.auth_user WHERE id=$1', [session.user.id]))
          .rows[0].email,
        defaultLoginEmail,
      );
    });
    await check('a failure inside Finish setting up changes nothing', async () => {
      await clear();
      await ensureDefaultLogin(owner.href);
      const session = await defaultSession();
      // The workspace step is the last to run: a workspace made in between
      // must roll back the new name, address and password with it.
      await db.query(
        "INSERT INTO app.workspace(id,name,audience) VALUES('existing','Existing','public')",
      );
      await assert.rejects(
        store.finishSetup(
          { kind: 'user', id: session.user.id, active: true },
          { ...finish, keepSessionId: session.session.id },
        ),
        (error: { status?: number; message?: string }) =>
          error.status === 422 && /already contains a workspace/.test(error.message ?? ''),
      );
      assert.deepEqual(
        (
          await db.query(
            'SELECT name,email,must_change_password FROM public.auth_user WHERE id=$1',
            [session.user.id],
          )
        ).rows[0],
        { name: 'Administrator', email: defaultLoginEmail, must_change_password: true },
      );
      assert.deepEqual(await counts(), { users: 1, accounts: 1, workspaces: 1, defaults: 1 });
      assert.equal(await signIn(defaultLoginEmail, defaultLoginPassword), defaultLoginEmail);
    });
    await check('Finish setting up retires the default login in one step', async () => {
      await clear();
      await ensureDefaultLogin(owner.href);
      const session = await defaultSession();
      const other = await defaultSession();
      const actor = { kind: 'user', id: session.user.id, active: true } as const;
      const result = await store.finishSetup(actor, {
        ...finish,
        email: 'Owner@Example.org',
        keepSessionId: session.session.id,
      });
      assert.equal(result.workspace, 'workshop');
      assert.deepEqual(await counts(), { users: 1, accounts: 1, workspaces: 1, defaults: 0 });
      assert.deepEqual(
        (
          await db.query(
            'SELECT u.name,u.email,u.must_change_password,a.granted_via,m.workspace_id,m.role,w.root FROM public.auth_user u JOIN app.installation_admin a ON a.user_id=u.id JOIN app.membership m ON m.actor_id=u.id JOIN app.workspace w ON w.id=m.workspace_id',
          )
        ).rows,
        [
          {
            name: 'Owner',
            email: 'owner@example.org',
            must_change_password: false,
            granted_via: 'setup',
            workspace_id: 'workshop',
            role: 'manage',
            root: true,
          },
        ],
      );
      // Only the finishing browser stays signed in.
      assert.deepEqual(
        (await db.query('SELECT id FROM public.auth_session')).rows.map((row) => row.id),
        [session.session.id],
      );
      assert.notEqual(other.session.id, session.session.id);
      assert.equal(await signIn(defaultLoginEmail, defaultLoginPassword), null);
      assert.equal(await signIn(finish.email, defaultLoginPassword), null);
      assert.equal(await signIn(finish.email, finish.password), finish.email);
      const hash = (
        await db.query('SELECT password FROM public.auth_account WHERE user_id=$1', [
          session.user.id,
        ])
      ).rows[0].password;
      assert.equal(await verifyCredentialPassword({ password: finish.password, hash }), true);
      assert.equal(await setupState(pool), 'complete');
      assert.equal(await setupStateAsOwner(owner.href), 'complete');
      assert.equal(await store.defaultLoginAccount(), null);
      assert.deepEqual(
        (
          await db.query(
            "SELECT actor_kind,actor_id,details->>'workspace' AS workspace FROM app.account_audit WHERE action='account.setup_finished'",
          )
        ).rows,
        [{ actor_kind: 'account', actor_id: session.user.id, workspace: 'workshop' }],
      );
      await assert.rejects(
        store.finishSetup(actor, { ...finish, keepSessionId: session.session.id }),
        (error: { status?: number }) => error.status === 404,
      );
      // The finished account changes its password normally from now on.
      const stored = await store.currentPasswordHash(session.user.id);
      await store.changeOwnPassword(actor, {
        expectedHash: stored!,
        newHash: await hashCredentialPassword('another long password'),
        keepSessionId: session.session.id,
      });
      // A finished installation never gets a default login again.
      assert.equal(await ensureDefaultLogin(owner.href), 'not-needed');
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
