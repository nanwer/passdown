/** Disposable-only security regressions. Never accepts an application database name. */
import assert from 'node:assert/strict';
import pg from 'pg';
import { createApplicationStore } from '../src/store';
import { newDocument } from '../../../apps/web/components/studio/model';
import { readConfig } from '../../../scripts/local-config.mjs';
import { migrate } from '../../../scripts/migrate-local.mjs';
const config = readConfig();
const name = process.env.PASSDOWN_PRODUCT_TEST_DATABASE;
if (!name || !/^release_b_[a-z0-9_]+$/.test(name))
  throw new Error('Set a unique release_b_* test database');
function dedicated(value: string) {
  const u = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) throw new Error('Loopback only');
  u.pathname = `/${name}`;
  return u.href;
}
const ownerURL = dedicated(config.GUIDE_OWNER_DATABASE_URL);
const runtimeURL = dedicated(config.GUIDE_DATABASE_URL);
const adminURL = new URL(ownerURL);
adminURL.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminURL.href });
await admin.connect();
if (!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [name])).rowCount)
  await admin.query(`CREATE DATABASE "${name}"`);
await admin.end();
await migrate(ownerURL, runtimeURL);
const owner = new pg.Pool({ connectionString: ownerURL });
const runtime = new pg.Pool({ connectionString: runtimeURL });
let failed = 0;
async function check(name: string, run: () => Promise<void>) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}: ${(e as Error).message}`);
  }
}
async function scoped(who: string | null, run: (client: pg.PoolClient) => Promise<void>) {
  const c = await runtime.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      "SELECT set_config('guide.actor_kind',$1,true),set_config('guide.actor_id',$2,true),set_config('guide.actor_active','true',true),set_config('guide.workspace_id','public',true)",
      [who ? 'user' : 'anonymous', who ?? ''],
    );
    await run(c);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
}
const passwordHash = 'a'.repeat(32) + ':' + 'b'.repeat(128);
try {
  await owner.query('TRUNCATE public.auth_user,app.workspace CASCADE');
  await owner.query(
    "INSERT INTO public.auth_user(id,name,email,email_verified,active) VALUES('owner','Owner','owner@test.local',true,true),('reader','Reader','reader@test.local',true,true),('outsider','Outsider','outsider@test.local',true,true),('suspended','Suspended','suspended@test.local',true,false),('unverified','Unverified','unverified@test.local',false,true)",
  );
  await owner.query(
    "INSERT INTO app.workspace(id,name,audience,root) VALUES('public','Public','public',true); INSERT INTO app.membership VALUES('public','owner','manage',true),('public','reader','view',true),('public','suspended','manage',true),('public','unverified','manage',true)",
  );
  await owner.query(
    "INSERT INTO public.auth_account(id,account_id,provider_id,user_id,password) SELECT id,id,'credential',id,$1 FROM public.auth_user",
    [passwordHash],
  );
  await check(
    'store rejects stale publication changes and keeps withdrawn drafts editable',
    async () => {
      const store = createApplicationStore({ connectionString: runtimeURL });
      const actor = { kind: 'user' as const, id: 'owner', active: true };
      try {
        const category = await store.createCategory(actor, 'public', {
          domain: 'guide',
          parentId: null,
          name: 'Fixture thing',
          description: '',
          visibility: 'public',
          sortOrder: 0,
        });
        const document = newDocument();
        document.title = 'Fixture procedure';
        document.summary = 'Synthetic product regression';
        document.steps[0]!.title = 'Prepare';
        const guide = await store.createDraft(actor, 'public', {
          audience: 'public',
          categoryId: category.id,
          document,
        });
        assert.equal(guide.publicationRevision, 0);
        await owner.query(
          "UPDATE app.guide SET state='published',current_release=1,published_version=version WHERE id=$1",
          [guide.id],
        );
        const current = await store.getDraft(actor, 'public', guide.id);
        assert.ok(current);
        const withdrawn = await store.withdrawGuide(actor, 'public', guide.id, {
          expectedRelease: 1,
          expectedPublicationRevision: current.publicationRevision,
        });
        assert.equal(withdrawn.state, 'withdrawn');
        assert.equal(withdrawn.publicationRevision, current.publicationRevision + 1);
        assert.equal((await store.getDraft(actor, 'public', guide.id))?.state, 'withdrawn');
        assert.equal(await store.withdrawnNotice({ kind: 'anonymous' }, 'public', guide.id), true);
        await assert.rejects(
          store.withdrawGuide(actor, 'public', guide.id, {
            expectedRelease: 1,
            expectedPublicationRevision: current.publicationRevision,
          }),
          { code: 'PUBLICATION_CHANGED' },
        );
        const restored = await store.reinstateGuide(actor, 'public', guide.id, {
          expectedRelease: 1,
          expectedPublicationRevision: withdrawn.publicationRevision,
        });
        assert.equal(restored.state, 'published');
        assert.equal(restored.publicationRevision, withdrawn.publicationRevision + 1);
        await assert.rejects(
          store.publishDraft(actor, 'public', guide.id, {
            expectedRelease: 1,
            expectedPublicationRevision: current.publicationRevision,
            expectedVersion: 1,
            license: 'CC-BY-4.0',
          }),
          { code: 'PUBLICATION_CHANGED' },
        );
      } finally {
        await store.close();
      }
    },
  );
  await check('withdrawal revision is stored on new guides', async () => {
    assert.equal(
      (
        await owner.query(
          "SELECT column_default FROM information_schema.columns WHERE table_schema='app' AND table_name='guide' AND column_name='publication_revision'",
        )
      ).rows[0]?.column_default,
      '0',
    );
  });
  for (const actor of [null, 'reader', 'outsider', 'suspended', 'unverified']) {
    await check(`reinstate blockers refuse ${actor ?? 'anonymous'}`, () =>
      scoped(actor, async (c) => {
        await assert.rejects(
          c.query("SELECT * FROM app.guide_reinstate_blockers('public','missing')"),
          { code: '42501' },
        );
      }),
    );
    await check(`administration refuses ${actor ?? 'anonymous'}`, () =>
      scoped(actor, async (c) => {
        await assert.rejects(c.query("SELECT * FROM app.admin_list_accounts('',100)"), {
          code: '42501',
        });
      }),
    );
  }
  await check('runtime cannot replace a credential outside the locked function', () =>
    scoped('owner', async (c) => {
      await assert.rejects(
        c.query("UPDATE public.auth_account SET password=$1 WHERE user_id='owner'", [passwordHash]),
        { code: '42501' },
      );
    }),
  );
  await check('runtime cannot delete a credential', () =>
    scoped('owner', async (c) => {
      await assert.rejects(c.query("DELETE FROM public.auth_account WHERE user_id='owner'"), {
        code: '42501',
      });
    }),
  );
  await check('operator can grant but cannot revoke the last administrator', async () => {
    const result = await owner.query(
      "SELECT * FROM app.operator_grant_administrator('owner@test.local')",
    );
    assert.equal(result.rows[0].outcome, 'granted');
    assert.equal(
      (await owner.query("SELECT * FROM app.operator_revoke_administrator('owner@test.local')"))
        .rows[0].outcome,
      'last-administrator',
    );
    await assert.rejects(owner.query("UPDATE public.auth_user SET active=false WHERE id='owner'"), {
      code: '23514',
    });
  });
  await check('runtime cannot issue through the operator function', () =>
    scoped('owner', async (c) => {
      await assert.rejects(
        c.query("SELECT * FROM app.operator_issue_password_reset('reader@test.local',$1)", [
          'c'.repeat(64),
        ]),
        { code: '42501' },
      );
    }),
  );
  await check(
    'reset issuance stores only a hash and redemption ends all target sessions',
    async () => {
      const tokenHash = 'd'.repeat(64);
      await owner.query(
        "INSERT INTO public.auth_session(id,user_id,token,expires_at) VALUES('reader-session','reader','session-token',now()+interval '1 hour')",
      );
      await owner.query("SELECT * FROM app.operator_issue_password_reset('reader@test.local',$1)", [
        tokenHash,
      ]);
      await scoped(null, async (c) => {
        assert.equal(
          (await c.query('SELECT account_email FROM app.describe_password_reset($1)', [tokenHash]))
            .rows[0].account_email,
          'reader@test.local',
        );
        assert.equal(
          (
            await c.query('SELECT app.redeem_password_reset($1,$2) AS who', [
              tokenHash,
              passwordHash,
            ])
          ).rows[0].who,
          'reader',
        );
        assert.equal(
          (await c.query("SELECT count(*) FROM public.auth_session WHERE user_id='reader'")).rows[0]
            .count,
          '0',
        );
        assert.equal(
          (
            await c.query('SELECT app.redeem_password_reset($1,$2) AS who', [
              tokenHash,
              passwordHash,
            ])
          ).rows[0].who,
          null,
        );
      });
    },
  );
  await check('restore audit is idempotent per restoreId', async () => {
    await owner.query(
      'SELECT app.operator_record_restore(\'{"restoreId":"synthetic-restore"}\'::jsonb)',
    );
    await owner.query(
      'SELECT app.operator_record_restore(\'{"restoreId":"synthetic-restore"}\'::jsonb)',
    );
    assert.equal(
      (
        await owner.query(
          "SELECT count(*) FROM app.account_audit WHERE action='installation.restored'",
        )
      ).rows[0].count,
      '1',
    );
  });
} finally {
  await owner.end();
  await runtime.end();
}
if (failed) throw new Error(`${failed} product checks failed`);
