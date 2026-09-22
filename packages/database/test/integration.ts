import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  createApplicationStore,
  createIdentity,
  readSchemaState,
  describeSchemaState,
  describeSchemaDrift,
} from '../src/index';
import { readConfig } from '../../../scripts/local-config.mjs';
import { seedLocal } from '../../../scripts/seed-local';
import { migrate, requireLocal } from '../../../scripts/migrate-local.mjs';
import { libraryPageSize } from '@guide/contracts';
import type { Actor } from '@guide/core';
import { structuredChecks } from './structured-integration';
import { verifyStructuredMigration } from './migration-integration';
import { verifyBootstrap } from './bootstrap-integration';
import {
  editorDocumentToBody,
  parseStepMarkdown,
  toStructuredDocument,
  type GuideDocument,
} from '@guide/content';
const config = readConfig();
const ownerURL = new URL(config.GUIDE_OWNER_DATABASE_URL);
ownerURL.pathname = '/guide_app_test';
const runtimeURL = new URL(config.GUIDE_DATABASE_URL);
runtimeURL.pathname = '/guide_app_test';
requireLocal(ownerURL.href, 'guide_app_test');
requireLocal(runtimeURL.href, 'guide_app_test');
const admin = new pg.Client({ connectionString: config.GUIDE_OWNER_DATABASE_URL });
await admin.connect();
if (!(await admin.query("SELECT 1 FROM pg_database WHERE datname='guide_app_test'")).rowCount)
  await admin.query('CREATE DATABASE guide_app_test');
await admin.end();
await migrate(ownerURL.href, runtimeURL.href);
const owner = new pg.Pool({ connectionString: ownerURL.href, max: 2 });
await owner.query(
  'TRUNCATE app.outbox,app.audit,app.release,app.guide,app.membership,app.workspace,public.auth_session,public.auth_account,public.auth_verification,public.auth_user,app.rate_limit CASCADE',
);
await owner.query(
  "INSERT INTO auth_user(id,name,email,email_verified,active) VALUES('owner','Owner','owner@test.local',true,true),('mixed','Mixed','mixed@test.local',true,true),('reader','Reader','reader@test.local',true,true),('outsider','Outsider','outsider@test.local',true,true),('suspended','Suspended','suspended@test.local',true,false),('unverified','Unverified','unverified@test.local',false,true)",
);
await owner.query(
  "INSERT INTO app.workspace VALUES('public','Public','public'),('private','Private','private'); INSERT INTO app.membership VALUES('public','owner','manage',true),('private','owner','manage',true),('public','mixed','manage',true),('private','mixed','view',true),('private','reader','view',true),('private','suspended','manage',true),('private','unverified','manage',true)",
);
const store = createApplicationStore({ connectionString: runtimeURL.href });
const runtime = new pg.Pool({ connectionString: runtimeURL.href, max: 1 });
const actor = (id: string, active = true): Actor => ({ kind: 'user', id, active });
const anonymous: Actor = { kind: 'anonymous' };
const doc: GuideDocument = {
  schemaVersion: 1,
  title: 'Independent test title',
  summary: 'Independent test summary',
  locale: 'en',
  difficulty: 'easy',
  durationMinutes: 4,
  tools: [],
  steps: [
    {
      id: 'a10c070c-53b8-4bdc-aaf8-feb2bd4b0b3e',
      title: 'First operation',
      body: [
        {
          type: 'paragraph',
          children: [{ type: 'text', text: 'Measured test instruction.', marks: [] }],
        },
      ],
      media: [],
      callouts: [],
    },
  ],
};
const categoryIds: Record<string, string> = {};
for (const label of [
  'Candidate',
  'Changed',
  'Concurrent',
  'Media',
  'New category',
  'No',
  'Old',
  'Revocation candidate',
  'Rich content',
  'Secret category',
  'Test',
  'Test category',
  'Visual content',
]) {
  const category = await store.createCategory(actor('owner'), 'public', {
    domain: 'guide',
    parentId: null,
    name: label,
    description: '',
    visibility: 'public',
    sortOrder: 0,
  });
  categoryIds[label] = category.id;
}
const privateCategory = await store.createCategory(actor('owner'), 'private', {
  domain: 'guide',
  parentId: null,
  name: 'Secret category',
  description: '',
  visibility: 'members',
  sortOrder: 0,
});

let checks = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
async function denied(promise: Promise<unknown>, status = 404) {
  await assert.rejects(promise, (e: any) => e.status === status);
}
async function scoped<T>(who: Actor, workspace: string, fn: (c: pg.PoolClient) => Promise<T>) {
  const c = await runtime.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      "SELECT set_config('guide.actor_id',$1,true),set_config('guide.actor_active',$2,true),set_config('guide.workspace_id',$3,true),set_config('guide.actor_kind',$4,true)",
      [
        who.kind === 'user' ? who.id : '',
        String(who.kind === 'anonymous' || who.active),
        workspace,
        who.kind,
      ],
    );
    const result = await fn(c);
    await c.query('COMMIT');
    return result;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
try {
  await check(
    'workspace discovery separates anonymous public reads from member studio',
    async () => {
      assert.deepEqual(await store.listWorkspaces(anonymous), []);
      assert.equal((await store.getWorkspace(anonymous, 'public'))?.name, 'Public');
      assert.equal(await store.getWorkspace(anonymous, 'private'), null);
      assert.equal((await store.listWorkspaces(actor('owner'))).length, 2);
    },
  );
  let publicDraft: any, privateDraft: any;
  await check('owner creates scoped draft; anonymous and reader cannot see drafts', async () => {
    publicDraft = await store.createDraft(actor('owner'), 'public', {
      document: doc,
      categoryId: categoryIds['Test category']!,
      audience: 'public',
    });
    privateDraft = await store.createDraft(actor('owner'), 'private', {
      document: { ...doc, title: 'Secret procedure' },
      categoryId: privateCategory.id,
      audience: 'members',
    });
    assert.equal(publicDraft.version, 1);
    assert.equal(await store.getDraft(anonymous, 'public', publicDraft.id), null);
    assert.equal(await store.getDraft(actor('reader'), 'private', privateDraft.id), null);
    assert.deepEqual((await store.listReleases(anonymous, 'public')).guides, []);
  });
  await check(
    'owner-only writes, outsider/revoked/suspended/verified checks and immutable workspace',
    async () => {
      for (const who of [
        anonymous,
        actor('reader'),
        actor('outsider'),
        actor('suspended'),
        actor('unverified'),
        actor('mixed'),
      ])
        await denied(
          store.createDraft(who, 'private', {
            document: doc,
            categoryId: categoryIds['No']!,
            audience: 'members',
          }),
        );
      await denied(
        store.createDraft(actor('owner'), 'private', {
          document: doc,
          categoryId: categoryIds['No']!,
          audience: 'public',
        }),
        422,
      );
      assert.equal(await store.getDraft(actor('owner'), 'private', publicDraft.id), null);
      await denied(
        store.saveDraft(actor('owner'), 'private', publicDraft.id, {
          document: doc,
          categoryId: categoryIds['No']!,
          expectedVersion: 1,
        }),
      );
    },
  );
  await check(
    'unsupported media references are rejected before draft creation and saving',
    async () => {
      const mediaDocument = {
        ...doc,
        steps: [
          {
            ...doc.steps[0]!,
            media: [
              {
                assetId: 'bf1b1ce2-1f75-48a7-a77e-bf3dcb6ce635',
                alt: 'Unsupported asset',
                caption: '',
                annotations: [],
              },
            ],
          },
        ],
      };
      await denied(
        store.createDraft(actor('owner'), 'public', {
          document: mediaDocument,
          categoryId: categoryIds['Media']!,
          audience: 'public',
        }),
        422,
      );
      await denied(
        store.saveDraft(actor('owner'), 'public', publicDraft.id, {
          document: mediaDocument,
          categoryId: categoryIds['Media']!,
          expectedVersion: 1,
        }),
        422,
      );
    },
  );
  await check(
    'validation precedes write and stale save preserves newest manual version',
    async () => {
      await denied(
        store.saveDraft(actor('owner'), 'public', publicDraft.id, {
          document: { ...doc, title: '' },
          categoryId: categoryIds['Test']!,
          expectedVersion: 1,
        }),
        422,
      );
      const result = await store.saveDraft(actor('owner'), 'public', publicDraft.id, {
        document: { ...doc, title: 'Saved newer title' },
        categoryId: categoryIds['New category']!,
        expectedVersion: 1,
      });
      assert.equal(result.version, 2);
      await denied(
        store.saveDraft(actor('owner'), 'public', publicDraft.id, {
          document: doc,
          categoryId: categoryIds['Old']!,
          expectedVersion: 1,
        }),
        409,
      );
      assert.equal(
        (await store.getDraft(actor('owner'), 'public', publicDraft.id))?.title,
        'Saved newer title',
      );
    },
  );
  await check('publishing requires exact expected version/release and license', async () => {
    await denied(
      store.publishDraft(actor('owner'), 'public', publicDraft.id, {
        expectedVersion: 1,
        expectedRelease: null,
        license: 'CC-BY-4.0',
      }),
      409,
    );
    await denied(
      store.publishDraft(actor('owner'), 'public', publicDraft.id, {
        expectedVersion: 2,
        expectedRelease: 1,
        license: 'CC-BY-4.0',
      }),
      409,
    );
    await denied(
      store.publishDraft(actor('owner'), 'public', publicDraft.id, {
        expectedVersion: 2,
        expectedRelease: null,
      } as any),
      422,
    );
    const release = await store.publishDraft(actor('owner'), 'public', publicDraft.id, {
      expectedVersion: 2,
      expectedRelease: null,
      license: 'CC-BY-4.0',
    });
    assert.equal(release.release, 1);
    assert.equal(release.title, 'Saved newer title');
    assert.equal(release.license, 'CC-BY-4.0');
    await denied(
      store.publishDraft(actor('owner'), 'private', privateDraft.id, {
        expectedVersion: 1,
        expectedRelease: null,
        license: 'CC-BY-4.0',
      }),
      422,
    );
    await store.publishDraft(actor('owner'), 'private', privateDraft.id, {
      expectedVersion: 1,
      expectedRelease: null,
      license: 'all-rights-reserved',
    });
  });
  await check(
    'public/private reads, restricted metadata and scope isolation share same runtime',
    async () => {
      assert.equal(
        (await store.getRelease(anonymous, 'public', publicDraft.id))?.title,
        'Saved newer title',
      );
      assert.equal(await store.getRelease(anonymous, 'private', privateDraft.id), null);
      assert.equal(await store.getRelease(actor('outsider'), 'private', privateDraft.id), null);
      assert.equal(
        (await store.getRelease(actor('reader'), 'private', privateDraft.id))?.title,
        'Secret procedure',
      );
      assert.equal(await store.getRelease(actor('suspended'), 'public', publicDraft.id), null);
      assert.equal(await store.getRelease(actor('unverified'), 'public', publicDraft.id), null);
      assert.equal(await store.getRelease(actor('owner'), 'private', publicDraft.id), null);
      assert.deepEqual(
        (await store.listReleases(anonymous, 'private', { search: 'Secret' })).guides,
        [],
      );
      assert.equal(
        (
          await store.listReleases(anonymous, 'public', {
            search: 'newer',
            category: 'New category',
          })
        ).total,
        1,
      );
      await owner.query("UPDATE app.membership SET active=false WHERE actor_id='reader'");
      assert.equal(await store.getRelease(actor('reader'), 'private', privateDraft.id), null);
    },
  );
  await check('search uses normalized title/summary and does not search categories', async () => {
    assert.equal(
      (await store.listReleases(anonymous, 'public', { search: 'Ｓａｖｅｄ' })).total,
      1,
    );
    assert.deepEqual(
      (await store.listReleases(anonymous, 'public', { search: 'New category' })).guides,
      [],
    );
  });
  await check(
    'published immutable snapshot survives saves; concurrent duplicate publish has single winner',
    async () => {
      await store.saveDraft(actor('owner'), 'public', publicDraft.id, {
        expectedVersion: 2,
        document: { ...doc, title: 'Unpublished change' },
        categoryId: categoryIds['Changed']!,
      });
      assert.equal(
        (await store.getRelease(anonymous, 'public', publicDraft.id))?.title,
        'Saved newer title',
      );
      const results = await Promise.allSettled(
        [1, 2].map(() =>
          store.publishDraft(actor('owner'), 'public', publicDraft.id, {
            expectedVersion: 3,
            expectedRelease: 1,
            license: 'CC-BY-SA-4.0',
          }),
        ),
      );
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.status,
        409,
      );
      await denied(
        store.publishDraft(actor('owner'), 'public', publicDraft.id, {
          expectedVersion: 3,
          expectedRelease: 2,
          license: 'CC-BY-SA-4.0',
        }),
        409,
      );
      assert.equal(
        (
          await owner.query(
            "SELECT document->>'title' AS title FROM app.release WHERE guide_id=$1 AND number=1",
            [publicDraft.id],
          )
        ).rows[0].title,
        'Saved newer title',
      );
    },
  );
  await check('release, audit and outbox agree after rejected writes', async () => {
    for (const table of ['release', 'audit', 'outbox'])
      assert.equal(
        Number((await owner.query(`SELECT count(*) FROM app.${table}`)).rows[0].count),
        3,
      );
  });
  await check(
    'late outbox failure rolls publication, audit and guide pointer back together',
    async () => {
      await store.saveDraft(actor('owner'), 'public', publicDraft.id, {
        expectedVersion: 3,
        document: { ...doc, title: 'Atomic candidate' },
        categoryId: categoryIds['Candidate']!,
      });
      await owner.query(
        "CREATE FUNCTION app.test_fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated outbox failure'; END $$; CREATE TRIGGER test_fail_outbox BEFORE INSERT ON app.outbox FOR EACH ROW EXECUTE FUNCTION app.test_fail_outbox()",
      );
      try {
        await assert.rejects(
          store.publishDraft(actor('owner'), 'public', publicDraft.id, {
            expectedVersion: 4,
            expectedRelease: 2,
            license: 'CC-BY-4.0',
          }),
          /simulated outbox failure/,
        );
      } finally {
        await owner.query(
          'DROP TRIGGER test_fail_outbox ON app.outbox; DROP FUNCTION app.test_fail_outbox()',
        );
      }
      assert.equal(
        (await store.getDraft(actor('owner'), 'public', publicDraft.id))?.currentRelease,
        2,
      );
      assert.equal(
        (await store.getRelease(anonymous, 'public', publicDraft.id))?.title,
        'Unpublished change',
      );
      for (const table of ['release', 'audit', 'outbox'])
        assert.equal(
          Number((await owner.query(`SELECT count(*) FROM app.${table}`)).rows[0].count),
          3,
        );
    },
  );
  await check('concurrent manual saves accept one version and preserve winner text', async () => {
    const results = await Promise.allSettled(
      ['Concurrent A', 'Concurrent B'].map((title) =>
        store.saveDraft(actor('owner'), 'public', publicDraft.id, {
          expectedVersion: 4,
          document: { ...doc, title },
          categoryId: categoryIds['Concurrent']!,
        }),
      ),
    );
    const winner = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>;
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.status,
      409,
    );
    assert.equal(
      (await store.getDraft(actor('owner'), 'public', publicDraft.id))?.title,
      winner.value.title,
    );
    assert.equal(winner.value.version, 5);
  });
  await check(
    'scope acquisition waits for membership revocation and denies the pending write',
    async () => {
      const revoker = await owner.connect();
      await revoker.query('BEGIN');
      await revoker.query(
        "UPDATE app.membership SET active=false WHERE actor_id='mixed' AND workspace_id='public'",
      );
      const pending = store.createDraft(actor('mixed'), 'public', {
        document: doc,
        categoryId: categoryIds['Revocation candidate']!,
        audience: 'public',
      });
      // Attach rejection immediately; the scoped repository waits on this membership row.
      const rejected = denied(pending);
      await revoker.query('COMMIT');
      revoker.release();
      await rejected;
      assert.equal(
        (await owner.query("SELECT count(*) FROM app.guide WHERE category='Revocation candidate'"))
          .rows[0].count,
        '0',
      );
    },
  );
  await check(
    'withdrawn/redacted rows disappear before search and direct metadata projection',
    async () => {
      for (const state of ['withdrawn', 'redacted']) {
        await owner.query('UPDATE app.guide SET state=$1 WHERE id=$2', [state, publicDraft.id]);
        assert.equal(await store.getRelease(anonymous, 'public', publicDraft.id), null);
        assert.deepEqual(
          (await store.listReleases(anonymous, 'public', { search: 'Unpublished' })).guides,
          [],
        );
        await scoped(actor('owner'), 'public', async (c) => {
          assert.equal(
            (await c.query('SELECT * FROM app.guide WHERE id=$1', [publicDraft.id])).rowCount,
            0,
          );
          assert.equal(
            (await c.query('SELECT * FROM app.release WHERE guide_id=$1', [publicDraft.id]))
              .rowCount,
            0,
          );
        });
      }
      await owner.query("UPDATE app.guide SET state='published' WHERE id=$1", [publicDraft.id]);
    },
  );
  await check(
    'actual runtime grants are nonowner/nonbypass; no schema authority or release edits',
    async () => {
      const r = (
        await runtime.query(
          'SELECT rolname,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user',
        )
      ).rows[0];
      assert.equal(r.rolname, 'guide_runtime');
      for (const k of ['rolsuper', 'rolbypassrls', 'rolcreatedb', 'rolcreaterole'])
        assert.equal(r[k], false);
      await assert.rejects(runtime.query('CREATE TABLE app.illegal(id int)'));
      await assert.rejects(runtime.query("UPDATE app.release SET license='all-rights-reserved'"));
      await assert.rejects(runtime.query('DELETE FROM app.audit'));
      // Membership became writable by the runtime role in 021, so that a
      // manager can invite and remove people. What protects it is row-level
      // rather than a withheld grant, and row-level security filters instead of
      // failing: with no actor scope set, the policy matches nothing and this
      // changes no rows. Asserting the count is the stronger statement anyway —
      // a rejection only says the statement did not run, this says nothing moved.
      assert.equal(
        (await runtime.query("UPDATE app.membership SET role='manage'")).rowCount,
        0,
        "an unscoped connection may not change anyone's permissions",
      );
      assert.equal(
        (await runtime.query('DELETE FROM app.membership')).rowCount,
        0,
        'nor remove anyone',
      );
    },
  );
  await check(
    'malformed and partially initialized actor context cannot read public releases',
    async () => {
      for (const [kind, id] of [
        ['', ''],
        ['unknown', ''],
        ['user', ''],
        ['anonymous', 'owner'],
      ]) {
        await scoped(anonymous, 'public', async (c) => {
          await c.query(
            "SELECT set_config('guide.actor_kind',$1,true),set_config('guide.actor_id',$2,true)",
            [kind, id],
          );
          assert.equal(
            (await c.query('SELECT app.actor_allowed() AS allowed')).rows[0].allowed,
            false,
          );
          assert.equal((await c.query("SELECT * FROM app.published_guides('public')")).rowCount, 0);
        });
      }
    },
  );
  await check('RLS directly denies anonymous drafts and outsider private releases', async () => {
    await scoped(anonymous, 'public', async (c) => {
      assert.equal((await c.query('SELECT * FROM app.guide')).rowCount, 0);
      assert.equal(
        (await c.query('SELECT * FROM app.release WHERE guide_id=$1', [publicDraft.id])).rowCount,
        2,
      );
    });
    await scoped(actor('outsider'), 'private', async (c) => {
      assert.equal((await c.query('SELECT * FROM app.release')).rowCount, 0);
      assert.equal((await c.query("SELECT * FROM app.published_guides('private')")).rowCount, 0);
    });
    await scoped(actor('owner'), 'public', async (c) => {
      assert.equal(
        (await c.query("SELECT * FROM app.guide WHERE workspace_id='private'")).rowCount,
        0,
      );
      assert.equal((await c.query("SELECT * FROM app.published_guides('private')")).rowCount, 0);
    });
  });
  await check(
    'RLS directly rejects reader insert and owner move even across owned workspaces',
    async () => {
      await assert.rejects(
        scoped(actor('mixed'), 'private', (c) =>
          c.query(
            "INSERT INTO app.guide(id,workspace_id,audience,document,category,author) VALUES($1,'private','members',$2,'No','No')",
            [randomUUID(), doc],
          ),
        ),
      );
      await assert.rejects(
        scoped(actor('owner'), 'public', (c) =>
          c.query("UPDATE app.guide SET workspace_id='private' WHERE id=$1", [publicDraft.id]),
        ),
      );
    },
  );
  await check('audit and outbox cannot bind another workspace guide to this scope', async () => {
    await assert.rejects(
      scoped(actor('owner'), 'public', (c) =>
        c.query(
          "INSERT INTO app.audit(id,workspace_id,guide_id,actor_id,action,details) VALUES($1,'public',$2,'owner','invalid','{}')",
          [randomUUID(), privateDraft.id],
        ),
      ),
    );
    await assert.rejects(
      scoped(actor('owner'), 'public', (c) =>
        c.query(
          "INSERT INTO app.outbox(id,workspace_id,guide_id,event,payload) VALUES($1,'public',$2,'invalid','{}')",
          [randomUUID(), privateDraft.id],
        ),
      ),
    );
  });
  await check('pool clears scope on commit and rollback', async () => {
    await scoped(actor('owner'), 'private', async (c) => {
      assert.equal((await c.query('SELECT * FROM app.guide')).rowCount, 1);
    });
    for (const result of (
      await runtime.query(
        "SELECT current_setting('guide.actor_id',true) AS actor,current_setting('guide.workspace_id',true) AS workspace",
      )
    ).rows)
      assert.ok(!result.actor && !result.workspace);
    await assert.rejects(
      scoped(actor('owner'), 'private', async () => {
        throw new Error('force rollback');
      }),
    );
    assert.equal((await runtime.query('SELECT * FROM app.guide')).rowCount, 0);
    assert.equal((await store.listReleases(anonymous, 'public')).total, 1);
  });
  await check(
    'atomic bounded rate counters allow exactly the limit under concurrency and expire',
    async () => {
      const result = await Promise.all(
        Array.from({ length: 15 }, () => store.consumeRateLimit('test-key', 3, 60)),
      );
      assert.equal(result.filter(Boolean).length, 3);
      assert.equal(
        Number(
          (await owner.query("SELECT count FROM app.rate_limit WHERE key='test-key'")).rows[0]
            .count,
        ),
        3,
      );
      await owner.query("UPDATE app.rate_limit SET expires_at=now()-interval '1 second'");
      assert.equal(await store.consumeRateLimit('test-key', 3, 60), true);
    },
  );
  await check(
    'a newly published edit uses actual author and is not mislabeled as an original sample',
    async () => {
      await owner.query(
        "UPDATE app.guide SET is_sample=true,author='Original illustrative sample' WHERE id=$1",
        [publicDraft.id],
      );
      const release = await store.publishDraft(actor('owner'), 'public', publicDraft.id, {
        expectedVersion: 5,
        expectedRelease: 2,
        license: 'CC-BY-4.0',
      });
      assert.equal(release.isSample, false);
      assert.equal(release.author, 'Owner');
    },
  );
  await check(
    'original seed snapshot remains illustrative after owner publishes an edited release',
    async () => {
      const testConfig = {
        ...config,
        GUIDE_OWNER_DATABASE_URL: ownerURL.href,
        GUIDE_DATABASE_URL: runtimeURL.href,
        BETTER_AUTH_URL: 'http://127.0.0.1:3101',
      };
      await seedLocal(testConfig);
      const id = (await owner.query("SELECT id FROM auth_user WHERE email='owner@guide.local'"))
        .rows[0].id;
      const original = await store.getRelease(anonymous, 'repair-collective', 'bicycle-brake');
      assert.equal(original?.isSample, true);
      assert.equal(original?.license, 'local-preview-only');
      const draft = await store.getDraft(actor(id), 'repair-collective', 'bicycle-brake');
      assert.ok(draft);
      await store.saveDraft(actor(id), 'repair-collective', 'bicycle-brake', {
        expectedVersion: 1,
        document: {
          ...toStructuredDocument(draft.document),
          unresolvedTools: [],
          title: 'My edited bicycle instructions',
        },
        categoryId: draft.categoryId,
      });
      const published = await store.publishDraft(actor(id), 'repair-collective', 'bicycle-brake', {
        expectedVersion: 2,
        expectedRelease: 1,
        license: 'CC-BY-4.0',
      });
      assert.equal(published.isSample, false);
      assert.equal(published.author, 'Local owner');
      const first = (
        await owner.query(
          "SELECT author,is_sample,license,document->>'title' AS title FROM app.release WHERE guide_id='bicycle-brake' AND number=1",
        )
      ).rows[0];
      assert.equal(first.is_sample, true);
      assert.equal(first.author, 'Repair collective');
      assert.equal(first.license, 'local-preview-only');
      assert.equal(first.title, 'Get to know a bicycle brake');
      await seedLocal(testConfig);
      assert.equal(
        (await store.getRelease(anonymous, 'repair-collective', 'bicycle-brake'))?.title,
        'My edited bicycle instructions',
      );
    },
  );
  await check(
    'identity uses migrated adapter; signup disabled, unverified login rejected and sessions revoked',
    async () => {
      const bootstrap = createIdentity({
        connectionString: runtimeURL.href,
        secret: config.BETTER_AUTH_SECRET,
        baseURL: 'http://127.0.0.1:3101',
        allowSignUp: true,
      });
      const identity = createIdentity({
        connectionString: runtimeURL.href,
        secret: config.BETTER_AUTH_SECRET,
        baseURL: 'http://127.0.0.1:3101',
      });
      const password = 'Integration-only-' + randomUUID();
      try {
        await assert.rejects(
          identity.api.signUpEmail({
            body: { email: 'disabled@test.local', password, name: 'Disabled' },
          }),
        );
        const created = await bootstrap.api.signUpEmail({
          body: { email: 'login@test.local', password, name: 'Login' },
        });
        await assert.rejects(
          identity.api.signInEmail({ body: { email: 'login@test.local', password } }),
        );
        await owner.query('UPDATE auth_user SET email_verified=true WHERE id=$1', [
          created.user.id,
        ]);
        const signed = await identity.api.signInEmail({
          body: { email: 'login@test.local', password },
          asResponse: true,
        });
        assert.equal(signed.status, 200);
        const cookie = signed.headers.get('set-cookie')!.split(';')[0]!;
        const session = await identity.api.getSession({ headers: new Headers({ cookie }) });
        assert.equal(session?.user.id, created.user.id);
        await owner.query('DELETE FROM auth_session WHERE user_id=$1', [created.user.id]);
        assert.equal(await identity.api.getSession({ headers: new Headers({ cookie }) }), null);
      } finally {
        await bootstrap.close();
        await identity.close();
      }
    },
  );
  await check(
    'every V2 instruction block publishes without losing its structure; empty panels are rejected',
    async () => {
      for (const markdown of [
        '## Preparation',
        '1. **Inspect** the part',
        '> [!WARNING]\n> Disconnect power.',
        '> Check the specification.',
        '| Part | Count |\n| --- | --- |\n| Seal | 1 |',
      ]) {
        const body = parseStepMarkdown(markdown).body;
        const document: GuideDocument = {
          ...doc,
          schemaVersion: 2,
          steps: [{ ...doc.steps[0]!, body }],
        };
        const draft = await store.createDraft(actor('owner'), 'public', {
          document,
          categoryId: categoryIds['Rich content']!,
          audience: 'public',
        });
        await store.publishDraft(actor('owner'), 'public', draft.id, {
          expectedVersion: 1,
          expectedRelease: null,
          license: 'CC-BY-4.0',
        });
        const release = (
          await owner.query('SELECT document FROM app.release WHERE guide_id=$1 AND number=1', [
            draft.id,
          ])
        ).rows[0];
        assert.deepEqual(release.document, toStructuredDocument(document));
      }
      const empty: GuideDocument = {
        ...doc,
        schemaVersion: 2,
        steps: [
          {
            ...doc.steps[0]!,
            body: [
              {
                type: 'panel',
                tone: 'warning',
                children: [
                  { type: 'paragraph', children: [{ type: 'text', text: '  ', marks: [] }] },
                ],
              },
            ],
          },
        ],
      };
      const draft = await store.createDraft(actor('owner'), 'public', {
        document: empty,
        categoryId: categoryIds['Rich content']!,
        audience: 'public',
      });
      await denied(
        store.publishDraft(actor('owner'), 'public', draft.id, {
          expectedVersion: 1,
          expectedRelease: null,
          license: 'CC-BY-4.0',
        }),
        422,
      );
      assert.equal(
        (await store.getDraft(actor('owner'), 'public', draft.id))?.currentRelease,
        null,
      );
    },
  );
  await check(
    'V3 visual documents keep panels inside table cells through publication and reject unsafe links',
    async () => {
      const body = editorDocumentToBody({
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Inspection' }] },
                    ],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [
                      {
                        type: 'panel',
                        attrs: { tone: 'note' },
                        content: [
                          {
                            type: 'paragraph',
                            content: [
                              {
                                type: 'text',
                                text: 'Check the seal.',
                                marks: [
                                  { type: 'bold' },
                                  { type: 'link', attrs: { href: 'https://example.com/manual' } },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });
      const document: GuideDocument = {
        ...doc,
        schemaVersion: 3,
        steps: [{ ...doc.steps[0]!, body }],
      };
      const draft = await store.createDraft(actor('owner'), 'public', {
        document,
        categoryId: categoryIds['Visual content']!,
        audience: 'public',
      });
      await store.publishDraft(actor('owner'), 'public', draft.id, {
        expectedVersion: 1,
        expectedRelease: null,
        license: 'CC-BY-4.0',
      });
      const release = (
        await owner.query('SELECT document FROM app.release WHERE guide_id=$1 AND number=1', [
          draft.id,
        ])
      ).rows[0];
      assert.deepEqual(release.document, toStructuredDocument(document));
      const unsafe = JSON.parse(
        JSON.stringify(document).replace('https://example.com/manual', 'javascript:alert(1)'),
      );
      await denied(
        store.saveDraft(actor('owner'), 'public', draft.id, {
          document: unsafe,
          categoryId: categoryIds['Visual content']!,
          expectedVersion: 1,
        }),
        422,
      );
      assert.deepEqual(
        (await store.getDraft(actor('owner'), 'public', draft.id))?.document,
        toStructuredDocument(document),
      );
    },
  );
  await check(
    'schema state reports a database that is behind or diverged, and clears once it matches',
    async () => {
      const current = await readSchemaState(owner);
      assert.equal(current.ok, true, 'the migrated test database should report as current');
      assert.equal(describeSchemaState(current), null);

      // A migration recorded by this build but absent from the database is the
      // case that used to surface as an unrelated runtime failure.
      const latest = (
        await owner.query('SELECT name,checksum FROM public.schema_migration ORDER BY name DESC')
      ).rows[0];
      await owner.query('DELETE FROM public.schema_migration WHERE name=$1', [latest.name]);
      try {
        const behind = await readSchemaState(owner);
        assert.equal(behind.ok, false);
        assert.equal(behind.ok === false && behind.reason, 'pending');
        assert(describeSchemaState(behind)!.includes(latest.name));
        assert(describeSchemaState(behind)!.includes('local:migrate'));

        // An edited migration cannot be repaired by re-running, so it is
        // reported as divergence rather than as merely behind.
        await owner.query(
          'INSERT INTO public.schema_migration(name,checksum) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET checksum=EXCLUDED.checksum',
          [latest.name, 'a'.repeat(64)],
        );
        const diverged = await readSchemaState(owner);
        assert.equal(diverged.ok === false && diverged.reason, 'changed');
        assert(!describeSchemaState(diverged)!.includes('local:migrate'));
      } finally {
        // Always put the record back: a half-finished run must not leave the
        // database looking like it is behind.
        await owner.query(
          'INSERT INTO public.schema_migration(name,checksum) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET checksum=EXCLUDED.checksum',
          [latest.name, latest.checksum],
        );
      }
      assert.equal((await readSchemaState(owner)).ok, true);
    },
  );
  await check('an invitation is a single-use secret that is never stored', async () => {
    const invite = await store.inviteToWorkspace(actor('owner'), 'private', {
      email: 'newcomer@test.local',
      role: 'view',
    });
    assert(invite.token.length >= 32);

    // What is kept is a hash. A copy of this table is not a set of working
    // invitations, which is the whole reason for hashing a token nobody chose.
    const stored = (
      await owner.query('SELECT token_hash FROM app.invitation WHERE id=$1', [invite.id])
    ).rows[0];
    assert(stored.token_hash && stored.token_hash !== invite.token);
    assert.equal(stored.token_hash.length, 64);
    assert.equal(
      (
        await owner.query('SELECT count(*)::int n FROM app.invitation WHERE token_hash=$1', [
          invite.token,
        ])
      ).rows[0].n,
      0,
      'the raw token appears nowhere in the table',
    );

    // Anyone holding the link learns who invited them and to what.
    const described = await store.describeInvitation(invite.token);
    assert.equal(described?.workspaceId, 'private');
    assert.equal(described?.role, 'view');
    // A token that is one character different is simply not an invitation.
    assert.equal(await store.describeInvitation(invite.token.slice(0, -1) + 'x'), null);

    // Redeeming it makes a member with the permission it carried.
    await owner.query(
      "INSERT INTO auth_user(id,name,email,email_verified,active) VALUES('newcomer','Newcomer','newcomer@test.local',true,true) ON CONFLICT DO NOTHING",
    );
    assert.equal(await store.acceptInvitation(invite.token, 'newcomer'), 'private');
    const people = await store.listPeople(actor('owner'), 'private');
    assert.equal(people.members.find((m) => m.actorId === 'newcomer')?.role, 'view');

    // And it is spent. A link that keeps working after it has been used is the
    // bug Grafana had to fix.
    assert.equal(await store.acceptInvitation(invite.token, 'outsider'), null);
    assert.equal(await store.describeInvitation(invite.token), null);
    assert.equal(
      people.invitations.find((i) => i.id === invite.id),
      undefined,
      'a spent invitation stops being listed as waiting',
    );
  });

  await check('a workspace can never be left with nobody who can manage it', async () => {
    // 'private' has several managers by now, so pick one that does not.
    const solo = 'public';
    const managers = (
      await owner.query(
        "SELECT actor_id FROM app.membership WHERE workspace_id=$1 AND role='manage' AND active",
        [solo],
      )
    ).rows;
    // Reduce to a single manager for the duration of this check.
    await owner.query('BEGIN');
    try {
      for (const extra of managers.slice(1))
        await owner.query('DELETE FROM app.membership WHERE workspace_id=$1 AND actor_id=$2', [
          solo,
          extra.actor_id,
        ]);
      const last = managers[0].actor_id;
      await assert.rejects(
        store.setMemberRole(actor(last), solo, last, 'view'),
        /at least one person who can manage/,
      );
      await assert.rejects(
        store.removeMember(actor(last), solo, last),
        /at least one person who can manage/,
      );
      await assert.rejects(
        owner.query(
          'UPDATE app.membership SET active=false WHERE workspace_id=$1 AND actor_id=$2',
          [solo, last],
        ),
        /at least one person who can manage/,
        'deactivating the last manager is the same mistake wearing a different hat',
      );
    } finally {
      await owner.query('ROLLBACK');
    }
  });

  await check('only a manager can see or change who is in a workspace', async () => {
    // 'reader' holds view on the private workspace.
    await denied(store.listPeople(actor('reader'), 'private'));
    await denied(
      store.inviteToWorkspace(actor('reader'), 'private', {
        email: 'sneak@test.local',
        role: 'manage',
      }),
    );
    await denied(store.removeMember(actor('reader'), 'private', 'owner'));
    await denied(store.listPeople(anonymous, 'private'));

    // And the rows themselves are invisible, not merely the methods.
    const seen = await scoped(
      actor('reader'),
      'private',
      async (c) => (await c.query('SELECT count(*)::int n FROM app.invitation')).rows[0].n,
    );
    assert.equal(seen, 0, 'row-level security hides invitations from a viewer');
  });

  await check('no policy or function decides access by a role that no longer exists', async () => {
    // Nineteen policies and two functions compared a role to 'owner'. Migration
    // 019 moved every one of them onto app.member_manages, and this is the
    // invariant that says so — a policy left behind would not fail a test, it
    // would silently deny everyone, because no membership can hold that word
    // any more.
    const stale = await owner.query(`
      SELECT tablename || '.' || policyname AS name FROM pg_policies
      WHERE schemaname='app'
        AND (coalesce(qual,'') LIKE '%owner%' OR coalesce(with_check,'') LIKE '%owner%')
      UNION ALL
      SELECT 'function ' || p.proname FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='app' AND p.prokind='f' AND pg_get_functiondef(p.oid) LIKE '%''owner''%'`);
    assert.deepEqual(
      stale.rows.map((r: { name: string }) => r.name),
      [],
      'these still decide access by a role the schema no longer permits',
    );

    // Every policy decides permission through app.member_manages rather than
    // comparing a role to a literal itself.
    //
    // This replaced a count of nineteen, which was the number of policies on
    // the day it was written and broke the moment invitations added four more.
    // Naming the rule instead of the tally is what makes it survive: a new
    // policy that compares roles by hand fails this, and adding an ordinary one
    // does not.
    const direct = await owner.query(
      `SELECT tablename || '.' || policyname AS name FROM pg_policies
       WHERE schemaname='app'
         AND (coalesce(qual,'') LIKE '%member_role%' OR coalesce(with_check,'') LIKE '%member_role%')`,
    );
    assert.deepEqual(
      direct.rows.map((r: { name: string }) => r.name),
      [],
      'these compare a membership role themselves instead of asking app.member_manages',
    );
    const managing = await owner.query(
      `SELECT count(*)::int n FROM pg_policies WHERE schemaname='app'
         AND (coalesce(qual,'') LIKE '%member_manages%' OR coalesce(with_check,'') LIKE '%member_manages%')`,
    );
    assert(managing.rows[0].n >= 19, 'the policies that gate on managing are still there');

    // The column cannot hold anything else, whatever the application believes.
    await assert.rejects(
      owner.query("UPDATE app.membership SET role='author' WHERE workspace_id='public'"),
      /membership_role_check/,
    );
  });

  await check(
    'drift between the application and the database is named, in both directions',
    async () => {
      // A column the application names that is not there. This is what a
      // process running since before a migration hits — a dropped column reads
      // exactly like this — and it used to fall through to "the service is
      // unavailable", which names nothing an operator can act on.
      //
      // createCatalogItem names `model` in its INSERT, so the rename is enough
      // to reproduce it without any row having to exist first. Renaming rather
      // than dropping keeps the type, constraints and data exactly as they were
      // when it goes back.
      await owner.query('ALTER TABLE app.catalog_item RENAME COLUMN model TO model_drift_test');
      try {
        await assert.rejects(
          store.createCatalogItem(actor('owner'), 'public', {
            name: 'Drift',
            specification: '',
            description: '',
            manufacturer: '',
            model: '',
            partNumber: '',
            defaultUnit: 'each',
            visibility: 'public',
          }),
          (error: { status?: number; code?: string }) =>
            error.status === 503 && error.code === 'SCHEMA_MISMATCH',
        );
      } finally {
        await owner.query('ALTER TABLE app.catalog_item RENAME COLUMN model_drift_test TO model');
      }
      // And the rename really did go back, so nothing after this check is
      // running against a half-restored table.
      assert.deepEqual(
        (await store.listCatalogItems(actor('owner'), 'public')).map((i) => i.name),
        [],
      );

      // A database carrying a migration this build has never heard of is
      // served, and said so. Refusing would turn a rolling deploy into an
      // outage: the new version migrates while old instances still answer.
      await owner.query(
        "INSERT INTO public.schema_migration(name,checksum) VALUES('999_from_a_later_build.sql',$1)",
        ['f'.repeat(64)],
      );
      try {
        const state = await readSchemaState(owner);
        assert.equal(state.ok, true, 'a database ahead of the build is still serveable');
        assert.equal(describeSchemaState(state), null);
        const drift = describeSchemaDrift(state);
        assert(drift?.includes('999_from_a_later_build.sql'));
        assert(drift?.includes('older than the schema'));
      } finally {
        await owner.query(
          "DELETE FROM public.schema_migration WHERE name='999_from_a_later_build.sql'",
        );
      }
      assert.equal(describeSchemaDrift(await readSchemaState(owner)), null);
    },
  );
  await check(
    '007 migration preserves release JSON and legacy wording, conceals restricted labels and reruns idempotently',
    verifyStructuredMigration,
  );
  await verifyBootstrap(check);
  await structuredChecks({ store, owner, runtime, check, scoped, actor, anonymous, doc });
  await check(
    'library listing is bounded and counted in the database, and sections only narrow',
    async () => {
      // A workspace of its own: this check publishes more guides than any
      // other, and the totals it asserts must not move when one is added
      // elsewhere in this suite.
      await owner.query(
        "INSERT INTO app.workspace VALUES('library','Library','public'); INSERT INTO app.membership VALUES('library','owner','manage',true)",
      );
      const shelf = await store.createCategory(actor('owner'), 'library', {
        domain: 'guide',
        parentId: null,
        name: 'Shelf',
        description: '',
        visibility: 'public',
        sortOrder: 0,
      });
      const branch = await store.createCategory(actor('owner'), 'library', {
        domain: 'guide',
        parentId: shelf.id,
        name: 'Branch',
        description: '',
        visibility: 'public',
        sortOrder: 0,
      });
      const publish = async (title: string, audience: 'public' | 'members') => {
        const draft = await store.createDraft(actor('owner'), 'library', {
          document: { ...doc, title, summary: 'Shelved summary' },
          categoryId: branch.id,
          audience,
        });
        await store.publishDraft(actor('owner'), 'library', draft.id, {
          expectedVersion: 1,
          expectedRelease: null,
          license: audience === 'public' ? 'CC-BY-4.0' : 'all-rights-reserved',
        });
        return draft.id;
      };
      const published = libraryPageSize + 6;
      for (let n = 0; n < published; n++) await publish(`Shelved guide ${n}`, 'public');
      await publish('Internal shelved guide', 'members');
      await store.createDraft(actor('owner'), 'library', {
        document: { ...doc, title: 'Never published' },
        categoryId: branch.id,
        audience: 'public',
      });

      // A visitor reads one page, and is told how large the collection is
      // rather than being handed all of it or shown a silent truncation.
      const first = await store.listReleases(anonymous, 'library');
      assert.equal(first.guides.length, libraryPageSize);
      assert.equal(first.total, published);
      assert.equal(first.offset, 0);
      const second = await store.listReleases(anonymous, 'library', { offset: libraryPageSize });
      assert.equal(second.guides.length, published - libraryPageSize);
      assert.equal(second.total, published);
      assert.equal(
        new Set([...first.guides, ...second.guides].map((g) => g.id)).size,
        published,
        'pages must not repeat or skip a guide',
      );
      // A parameter cannot undo the bound.
      assert.equal((await store.listReleases(anonymous, 'library', { limit: 5000 })).limit, 100);

      // Filtering happens in SQL and keeps the behavior it replaced: a
      // category includes its branches, and search reads titles and summaries
      // rather than category names.
      assert.equal(
        (await store.listReleases(anonymous, 'library', { categoryId: shelf.id })).total,
        published,
      );
      assert.equal(
        (await store.listReleases(anonymous, 'library', { search: 'Ｓｈｅｌｖｅｄ ｇｕｉｄｅ' }))
          .total,
        published,
      );
      assert.equal((await store.listReleases(anonymous, 'library', { search: 'Shelf' })).total, 0);
      assert.equal(
        (await store.listReleases(anonymous, 'library', { search: 'Never published' })).total,
        0,
      );

      // The section narrows an authorized set. It never widens one: the same
      // request as a visitor still cannot reach the internal guide.
      assert.equal((await store.listReleases(actor('owner'), 'library')).total, published + 1);
      assert.equal(
        (await store.listReleases(actor('owner'), 'library', { audience: 'members' })).total,
        1,
      );
      assert.equal(
        (await store.listReleases(anonymous, 'library', { audience: 'members' })).total,
        0,
      );

      // Browse totals come from the same authorized scope, so a visitor cannot
      // infer the internal guide or an unpublished draft from a count.
      const counts = async (who: Actor, audience?: 'public' | 'members') =>
        new Map(
          (await store.listLibraryCategoryCounts(who, 'library', audience)).map((c) => [
            c.categoryId,
            c,
          ]),
        );
      const visitor = await counts(anonymous);
      assert.equal(visitor.get(shelf.id)?.publishedSubtree, published);
      assert.equal(visitor.get(branch.id)?.publishedDirect, published);
      assert.equal(visitor.get(branch.id)?.direct, 0);
      const internal = await counts(actor('owner'), 'members');
      assert.equal(internal.get(shelf.id)?.publishedSubtree, 1);
    },
  );
  console.log(
    `${checks} persistent database/identity behavioral checks passed against guide_app_test.`,
  );
} finally {
  await store.close();
  await runtime.end();
  await owner.end();
}
