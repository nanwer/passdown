import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';
import { migrate, requireLocal } from '../../../scripts/migrate-local.mjs';
import { readConfig, root } from '../../../scripts/local-config.mjs';
import { createApplicationStore } from '../src/store';
/** Disposable pre-007 fixture proves real upgrades preserve old releases and private labels. */
export async function verifyStructuredMigration() {
  const config = readConfig();
  const url = new URL(config.GUIDE_OWNER_DATABASE_URL),
    runtime = new URL(config.GUIDE_DATABASE_URL);
  url.pathname = '/guide_app_migration_test';
  runtime.pathname = url.pathname;
  requireLocal(url.href, 'guide_app_migration_test');
  requireLocal(runtime.href, 'guide_app_migration_test');
  const admin = new pg.Client({ connectionString: config.GUIDE_OWNER_DATABASE_URL });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS guide_app_migration_test WITH (FORCE)');
  await admin.query('CREATE DATABASE guide_app_migration_test');
  const db = new pg.Client({ connectionString: url.href });
  let store: ReturnType<typeof createApplicationStore> | undefined;
  try {
    await db.connect();
    await db.query(
      'CREATE TABLE public.schema_migration(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    for (const name of readdirSync(root + 'packages/database/migrations')
      .filter((name) => name.endsWith('.sql') && name < '007_')
      .sort()) {
      const sql = readFileSync(root + 'packages/database/migrations/' + name, 'utf8');
      await db.query(sql);
      await db.query('INSERT INTO public.schema_migration(name,checksum) VALUES($1,$2)', [
        name,
        createHash('sha256').update(sql).digest('hex'),
      ]);
    }
    await db.query(
      "INSERT INTO public.auth_user(id,name,email,email_verified,active) VALUES('migration-owner','Owner','migration@example.test',true,true);INSERT INTO app.workspace VALUES('public','Public','public'),('private','Private','private');INSERT INTO app.membership VALUES('public','migration-owner','owner',true),('private','migration-owner','owner',true)",
    );
    const original = {
      schemaVersion: 1,
      title: 'Original title',
      summary: 'Original summary',
      locale: 'en',
      difficulty: 'easy',
      durationMinutes: 4,
      tools: ['Original tool wording', 'Original tool wording', 'Ambiguous object'],
      steps: [
        {
          id: '5c12596a-11a6-4e39-864c-c81502439220',
          title: 'Original step',
          body: [
            {
              type: 'paragraph',
              children: [
                { type: 'text', text: 'Keep this exact original instruction.', marks: [] },
              ],
            },
          ],
          media: [],
          callouts: [],
        },
      ],
    };
    const cases = [
      ['public-one', 'public', 'public', 'Electronics'],
      ['public-two', 'public', 'public', 'Ｅｌｅｃｔｒｏｎｉｃｓ'],
      ['restricted', 'public', 'members', 'Secret prototype'],
      ['private-one', 'private', 'members', 'Private machinery'],
    ];
    for (const [id, w, audience, label] of cases) {
      await db.query(
        "INSERT INTO app.guide(id,workspace_id,audience,state,document,category,current_release,published_version,author) VALUES($1,$2,$3,'published',$4,$5,1,1,'Original author')",
        [id, w, audience, original, label],
      );
      await db.query(
        "INSERT INTO app.release(guide_id,workspace_id,number,draft_version,document,category,license,author,is_sample) VALUES($1,$2,1,1,$3,$4,'all-rights-reserved','Original author',false)",
        [id, w, original, label],
      );
    }
    const before = (
      await db.query(
        'SELECT guide_id,document,category,author,license,draft_version FROM app.release ORDER BY guide_id',
      )
    ).rows;
    await migrate(url.href, runtime.href);
    assert.deepEqual(
      (
        await db.query(
          'SELECT guide_id,document,category,author,license,draft_version FROM app.release ORDER BY guide_id',
        )
      ).rows,
      before,
    );
    assert.equal(Number((await db.query('SELECT count(*) FROM app.category')).rows[0].count), 3);
    const drafts = (
      await db.query('SELECT id,document,category_id,version FROM app.guide ORDER BY id')
    ).rows;
    for (const draft of drafts) {
      assert.equal(draft.document.schemaVersion, 4);
      assert.equal(draft.version, 1);
      assert.deepEqual(
        draft.document.unresolvedTools.map((entry: any) => entry.label),
        original.tools,
      );
      assert.equal(draft.document.tools.length, 0);
      assert.equal(new Set(draft.document.unresolvedTools.map((entry: any) => entry.id)).size, 3);
      assert.ok(draft.category_id);
      assert.deepEqual(draft.document.steps[0].body, original.steps[0]!.body);
    }
    assert.equal(
      Number(
        (
          await db.query(
            'SELECT count(*) FROM app.release WHERE category_id IS NULL OR category_path IS NULL',
          )
        ).rows[0].count,
      ),
      0,
    );
    store = createApplicationStore({ connectionString: runtime.href });
    const publicTree = await store.listCategories({ kind: 'anonymous' }, 'public');
    assert.equal(publicTree.length, 1);
    assert(!publicTree.some((c) => c.name.includes('Secret')));
    assert.equal((await store.listCategories({ kind: 'anonymous' }, 'private')).length, 0);
    await migrate(url.href, runtime.href);
    assert.deepEqual(
      (await db.query('SELECT id,document,category_id,version FROM app.guide ORDER BY id')).rows,
      drafts,
    );
    assert.equal(Number((await db.query('SELECT count(*) FROM app.category')).rows[0].count), 3);
  } finally {
    await store?.close();
    await db.end();
    await admin.query('DROP DATABASE IF EXISTS guide_app_migration_test WITH (FORCE)');
    await admin.end();
  }
}
