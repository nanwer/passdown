import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { toStructuredDocument } from '../packages/guide-content/src/index';
import { createIdentity, canonicalAccountEmail } from '../packages/database/src/index';
import { createDemoQueries } from '../packages/testing/src/index';
import { requireLocal } from './migrate-local.mjs';
/** Operator-only bootstrap: never import this into request handlers. */
export async function seedLocal(config: Record<string, string>) {
  const db = requireLocal(config.GUIDE_OWNER_DATABASE_URL!);
  if (!['/guide_app', '/guide_app_test', '/guide_app_e2e'].includes(db.pathname))
    throw new Error('Only isolated local application databases may be seeded.');
  const runtime = requireLocal(config.GUIDE_DATABASE_URL!);
  if (runtime.pathname !== db.pathname || runtime.host !== db.host)
    throw new Error('Owner and runtime must address the same local database.');
  const client = new pg.Client({ connectionString: config.GUIDE_OWNER_DATABASE_URL });
  await client.connect();
  const auth = createIdentity({
    connectionString: config.GUIDE_DATABASE_URL!,
    secret: config.BETTER_AUTH_SECRET!,
    baseURL: config.BETTER_AUTH_URL!,
    allowSignUp: true,
  });
  try {
    await client.query('SELECT pg_advisory_lock(719821006)');
    const email = canonicalAccountEmail(config.GUIDE_LOCAL_OWNER_EMAIL || 'owner@guide.local');
    let user = (await client.query('SELECT id FROM public.auth_user WHERE email=$1', [email]))
      .rows[0];
    if (!user) {
      const result = await auth.api.signUpEmail({
        body: { email, password: config.GUIDE_LOCAL_OWNER_PASSWORD!, name: 'Local owner' },
      });
      user = result.user;
      await client.query('UPDATE public.auth_user SET email_verified=true WHERE id=$1', [user.id]);
    }
    await client.query('BEGIN');
    await client.query('SELECT * FROM app.operator_grant_administrator($1)', [email]);
    await client.query(
      // The public one is the workspace this installation serves at its root.
      // Migration 022 designates whatever is already there, but a database that
      // is migrated before it is seeded has nothing to designate — so the seed
      // has to say, exactly as the first-run bootstrap does.
      // Claims the root only when the installation has none, which is the same
      // rule the first-run bootstrap follows. Asserting it unconditionally
      // collides with a database that already designated one, and ON CONFLICT
      // does not help because the collision is on a different index.
      "INSERT INTO app.workspace(id,name,audience,root) VALUES('repair-collective','Repair collective','public',NOT EXISTS(SELECT 1 FROM app.workspace WHERE root)),('workshop','Workshop operations','private',false) ON CONFLICT(id) DO NOTHING",
    );
    await client.query(
      "INSERT INTO app.membership(workspace_id,actor_id,role) VALUES('repair-collective',$1,'manage'),('workshop',$1,'manage') ON CONFLICT(workspace_id,actor_id) DO NOTHING",
      [user.id],
    );
    // Fixture identity is used only to extract original illustrative content during operator setup.
    // It is never stored as a user, accepted as an app session, or connected to /preview.
    const fixtures = createDemoQueries();
    const seeds = [
      ...fixtures.inWorkspace({ kind: 'anonymous' }, 'repair-collective')!.list(),
      ...fixtures
        .inWorkspace({ kind: 'user', id: 'demo-reader', active: true }, 'workshop')!
        .list(),
    ];
    for (const guide of seeds) {
      // A repeated bootstrap must not recreate old category names after an owner reorganizes them.
      if ((await client.query('SELECT 1 FROM app.guide WHERE id=$1', [guide.id])).rowCount)
        continue;
      let category = (
        await client.query(
          "SELECT id,name FROM app.category WHERE workspace_id=$1 AND domain='guide' AND parent_id IS NULL AND app.normalized_name(name)=app.normalized_name($2)",
          [guide.workspaceId, guide.category],
        )
      ).rows[0];
      if (!category)
        category = (
          await client.query(
            "INSERT INTO app.category(id,workspace_id,domain,name,visibility) VALUES($1,$2,'guide',$3,$4) RETURNING id,name",
            [
              randomUUID(),
              guide.workspaceId,
              guide.category,
              guide.audience === 'public' ? 'public' : 'members',
            ],
          )
        ).rows[0];
      const added = await client.query(
        "INSERT INTO app.guide(id,workspace_id,audience,state,document,category,version,current_release,published_version,author,is_sample,updated_at,category_id) VALUES($1,$2,$3,'published',$4,$5,1,1,1,$6,true,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING id",
        [
          guide.id,
          guide.workspaceId,
          guide.audience,
          toStructuredDocument(guide.document, randomUUID),
          guide.category,
          guide.author,
          guide.updatedAt,
          category.id,
        ],
      );
      if (added.rowCount)
        await client.query(
          "INSERT INTO app.release(guide_id,workspace_id,number,draft_version,document,category,license,created_at,author,is_sample,category_id,category_path) VALUES($1,$2,1,1,$3,$4,'local-preview-only',$5,$6,true,$7,$8)",
          [
            guide.id,
            guide.workspaceId,
            guide.document,
            guide.category,
            guide.updatedAt,
            guide.author,
            category.id,
            JSON.stringify([{ id: category.id, name: guide.category }]),
          ],
        );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await auth.close();
    await client.end();
  }
}
