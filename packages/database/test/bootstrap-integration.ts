import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { migrate, requireLocal } from '../../../scripts/migrate-local.mjs';
import { readConfig } from '../../../scripts/local-config.mjs';
import { bootstrapFirstRun } from '../src/bootstrap';
import { createIdentity } from '../src/identity';

/**
 * First run, against a database that has genuinely never had a user.
 *
 * This needs its own database rather than the shared fixture, because the thing
 * under test is what happens when there is nothing at all — and the shared one
 * is seeded before the first check runs.
 */
export async function verifyBootstrap(
  check: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  const config = readConfig();
  const url = new URL(config.GUIDE_OWNER_DATABASE_URL);
  const runtime = new URL(config.GUIDE_DATABASE_URL);
  url.pathname = '/guide_app_bootstrap_test';
  runtime.pathname = url.pathname;
  requireLocal(url.href, 'guide_app_bootstrap_test');
  requireLocal(runtime.href, 'guide_app_bootstrap_test');

  const admin = new pg.Client({ connectionString: config.GUIDE_OWNER_DATABASE_URL });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS guide_app_bootstrap_test WITH (FORCE)');
  await admin.query('CREATE DATABASE guide_app_bootstrap_test');
  await admin.end();
  await migrate(url.href, runtime.href);

  const db = new pg.Client({ connectionString: url.href });
  await db.connect();
  const silent = () => {};
  const secret = 'b'.repeat(48);
  const baseURL = 'http://127.0.0.1:3100';

  try {
    await check(
      'an empty installation creates its own administrator and somewhere to work',
      async () => {
        const directory = mkdtempSync(join(tmpdir(), 'passdown-bootstrap-'));
        const passwordFile = join(directory, 'initial-password');
        const result = await bootstrapFirstRun({
          connectionString: runtime.href,
          secret,
          baseURL,
          email: 'first@example.test',
          passwordFile,
          workspaceName: 'Anvil & Forge',
          log: silent,
        });
        assert.equal(result.created, true);
        if (!result.created) return;

        // Generated, not shipped. A known default is the thing this exists to
        // avoid, so the password must differ every run and be long enough to be
        // worth generating.
        assert(result.password && result.password.length >= 20);

        // Readable by the operator and nobody else on the host.
        assert.equal(readFileSync(passwordFile, 'utf8').trim(), result.password);
        assert.equal(
          statSync(passwordFile).mode & 0o077,
          0,
          'the password file is not group or world readable',
        );

        const user = (
          await db.query(
            'SELECT id,email,email_verified,must_change_password FROM public.auth_user',
          )
        ).rows;
        assert.equal(user.length, 1);
        assert.equal(user[0].email, 'first@example.test');
        // No mail server exists to verify an address with, and the account is
        // useless until the password is replaced, which is the real gate.
        assert.equal(user[0].email_verified, true);
        assert.equal(user[0].must_change_password, true);

        // Something to manage. Without this the administrator signs in to an
        // installation with no workspace and no way to make one.
        const membership = (
          await db.query(
            'SELECT m.workspace_id, m.role, w.name, w.audience FROM app.membership m JOIN app.workspace w ON w.id = m.workspace_id',
          )
        ).rows;
        assert.equal(membership.length, 1);
        assert.equal(membership[0].role, 'manage');
        assert.equal(membership[0].name, 'Anvil & Forge');
        assert.equal(membership[0].workspace_id, 'anvil-forge');

        // The password handed to the operator is the one that actually works.
        // Worth asserting rather than assuming: a bootstrap that prints a
        // password nobody can sign in with is the same as no bootstrap at all.
        const identity = createIdentity({
          connectionString: runtime.href,
          secret,
          baseURL,
        });
        try {
          const session = await identity.api.signInEmail({
            body: { email: 'first@example.test', password: result.password },
          });
          assert.equal(session.user.email, 'first@example.test');
          await assert.rejects(
            identity.api.signInEmail({
              body: { email: 'first@example.test', password: result.password + 'x' },
            }),
            'the generated password is the only one that works',
          );
        } finally {
          await identity.close();
        }
      },
    );

    await check('a fresh installation has no workspace the front page depends on', async () => {
      // The root library was pinned to a workspace named in the source, so on
      // every installation that did not carry this project's development seed
      // — which is every one the bootstrap creates — the front page answered
      // 500. The name is still a literal until the information architecture
      // work decides what belongs at the root; what is asserted here is that
      // the bootstrap does not produce it, so nothing may assume it exists.
      const named = await db.query('SELECT id FROM app.workspace');
      assert(
        !named.rows.some((row: { id: string }) => row.id === 'repair-collective'),
        'the bootstrap must not be relied on to create the workspace the root page names',
      );
      assert(named.rows.length > 0, 'it does create one, just not that one');
    });

    await check('first run happens once, however many times the application starts', async () => {
      const before = (await db.query('SELECT count(*)::int n FROM public.auth_user')).rows[0].n;
      const again = await bootstrapFirstRun({
        connectionString: runtime.href,
        secret,
        baseURL,
        email: 'second@example.test',
        log: silent,
      });
      assert.deepEqual(again, { created: false, reason: 'users-exist' });
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM public.auth_user')).rows[0].n,
        before,
      );
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM public.auth_user WHERE email='second@example.test'",
          )
        ).rows[0].n,
        0,
      );
      // Nothing was written to record that setup happened — the emptiness of
      // the table is the lock, so there is no flag a restore could clear.
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int n FROM public.schema_migration WHERE name LIKE '%bootstrap%'",
          )
        ).rows[0].n,
        0,
      );
    });

    await check('an operator who supplies a password gets that one and no file', async () => {
      await db.query('TRUNCATE public.auth_session, public.auth_account, public.auth_user CASCADE');
      await db.query('TRUNCATE app.membership, app.workspace CASCADE');
      const result = await bootstrapFirstRun({
        connectionString: runtime.href,
        secret,
        baseURL,
        email: 'chosen@example.test',
        password: 'a-password-the-operator-picked',
        log: silent,
      });
      assert.equal(result.created, true);
      if (!result.created) return;
      // Nothing to hand back, because the operator already knows it.
      assert.equal(result.password, null);
      assert.equal(
        (
          await db.query(
            "SELECT must_change_password FROM public.auth_user WHERE email='chosen@example.test'",
          )
        ).rows[0].must_change_password,
        true,
        'a password someone typed into an environment variable still has to be replaced',
      );
    });

    await check('two servers starting at once produce one administrator', async () => {
      await db.query('TRUNCATE public.auth_session, public.auth_account, public.auth_user CASCADE');
      await db.query('TRUNCATE app.membership, app.workspace CASCADE');
      const run = () =>
        bootstrapFirstRun({
          connectionString: runtime.href,
          secret,
          baseURL,
          email: 'race@example.test',
          log: silent,
        });
      const results = await Promise.all([run(), run(), run()]);
      assert.equal(
        results.filter((r) => r.created).length,
        1,
        'the advisory lock is what stops three replicas each deciding they are first',
      );
      assert.equal((await db.query('SELECT count(*)::int n FROM public.auth_user')).rows[0].n, 1);
    });
  } finally {
    await db.end();
  }
}
