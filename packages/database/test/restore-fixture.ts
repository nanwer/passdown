import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { toStructuredDocument } from '@guide/content';
import type { MediaFileMetadata } from '@guide/contracts';
import pg from 'pg';
import { hashPassword } from 'better-auth/crypto';
import { ownerDatabaseTarget, pgClientConfig, runtimeDatabaseTarget } from '../src/config';
import { assertMigrationsMatchBuild, readMigrationDirectory } from '../src/migrator';
import { setupStateAsOwner } from '../src/setup';
import { openRestoreSession } from '../src/restore';

export type RestoreFixtureDatabase = { ownerURL: string; runtimeURL: string };
export type RestoreFixtureFile = MediaFileMetadata & { contents: Buffer };
export type RestoreFixtureSnapshot = {
  counts: Record<string, number>;
  credentialDigests: string[];
  checkpoint: string | null;
  publicGuides: { id: string; document: unknown }[];
  managerGuides: string[];
  setup: 'default-login' | 'no-account' | 'complete';
};

/** All databases are generated here and dropped here; configured databases are never modified. */
export async function withRestoreFixture(
  ownerURL: string,
  runtimeURL: string,
  use: (fixture: {
    source: RestoreFixtureDatabase;
    target: RestoreFixtureDatabase;
    files: RestoreFixtureFile[];
    expected: { workspace: string; actor: string; guide: string; document: unknown };
    newTarget(): Promise<RestoreFixtureDatabase>;
    snapshot(database: RestoreFixtureDatabase): Promise<RestoreFixtureSnapshot>;
    canConnect(database: RestoreFixtureDatabase): Promise<boolean>;
    checkpoint(database: RestoreFixtureDatabase): Promise<string | null>;
    verifyDatabaseControls(): Promise<void>;
  }) => Promise<void>,
): Promise<void> {
  const owner = new URL(ownerURL),
    runtime = new URL(runtimeURL);
  const runtimeIdentity = runtimeDatabaseTarget(runtime.href);
  owner.pathname = '/postgres';
  runtime.pathname = '/postgres';
  const admin = new pg.Client(pgClientConfig(ownerDatabaseTarget(owner.href)));
  await admin.connect();
  const created = new Set<string>();
  const roleSQL =
    'SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolvaliduntil FROM pg_roles WHERE rolname=$1';
  let roleBefore: pg.QueryResultRow[];
  try {
    roleBefore = (await admin.query(roleSQL, [runtimeIdentity.user])).rows;
  } catch (error) {
    await admin.end();
    throw error;
  }
  if (roleBefore.length !== 1) {
    await admin.end();
    throw new Error(
      'The existing runtime role is required; this fixture never creates or changes it.',
    );
  }
  const workspace = 'restore-fixture',
    actor = randomUUID(),
    guide = randomUUID(),
    category = randomUUID(),
    asset = randomUUID();
  const contents = Buffer.from(
    'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
    'base64',
  );
  const file = {
    workspace,
    asset,
    contents,
    bytes: contents.length,
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
  const document = toStructuredDocument(
    {
      schemaVersion: 3,
      title: 'Restore rehearsal guide',
      summary: 'A valid disposable published guide.',
      locale: 'en',
      difficulty: 'easy',
      durationMinutes: 5,
      tools: [],
      steps: [
        {
          id: randomUUID(),
          title: 'Inspect the picture',
          body: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Confirm that this original picture survives the backup and restore.',
                  marks: [],
                },
              ],
            },
          ],
          media: [
            { assetId: asset, alt: 'Synthetic one pixel fixture', caption: '', annotations: [] },
          ],
          callouts: [],
        },
      ],
    },
    randomUUID,
  );
  const newTarget = async (): Promise<RestoreFixtureDatabase> => {
    const name = `passdown_restore_${process.pid}_${randomBytes(6).toString('hex')}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    created.add(name);
    const targetOwner = new URL(owner.href),
      targetRuntime = new URL(runtime.href);
    targetOwner.pathname = targetRuntime.pathname = `/${name}`;
    return { ownerURL: targetOwner.href, runtimeURL: targetRuntime.href };
  };
  const checked = (database: RestoreFixtureDatabase) => {
    const target = ownerDatabaseTarget(database.ownerURL);
    assert(
      created.has(target.database),
      'Fixture probes may only access their generated databases.',
    );
    return target;
  };
  const withOwner = async <T>(
    database: RestoreFixtureDatabase,
    run: (client: pg.Client) => Promise<T>,
  ): Promise<T> => {
    const client = new pg.Client(pgClientConfig(checked(database)));
    await client.connect();
    try {
      return await run(client);
    } finally {
      await client.end();
    }
  };
  const canConnect = async (database: RestoreFixtureDatabase): Promise<boolean> => {
    checked(database);
    const client = new pg.Client(pgClientConfig(runtimeDatabaseTarget(database.runtimeURL)));
    try {
      await client.connect();
      return true;
    } catch {
      return false;
    } finally {
      await client.end();
    }
  };
  const checkpoint = (database: RestoreFixtureDatabase): Promise<string | null> =>
    withOwner(
      database,
      async (client) =>
        (
          await client.query(
            "SELECT shobj_description(oid,'pg_database') AS comment FROM pg_database WHERE datname=current_database()",
          )
        ).rows[0].comment,
    );
  const snapshot = async (database: RestoreFixtureDatabase): Promise<RestoreFixtureSnapshot> => {
    const counts = await withOwner(database, async (client) => {
      const result: Record<string, number> = {};
      for (const table of [
        'public.auth_user',
        'public.auth_account',
        'public.auth_session',
        'public.auth_verification',
        'app.workspace',
        'app.membership',
        'app.guide',
        'app.release',
        'app.asset',
        'app.invitation',
        'app.rate_limit',
        'public.schema_migration',
      ])
        result[table] = Number(
          (await client.query(`SELECT count(*) AS count FROM ${table}`)).rows[0].count,
        );
      return result;
    });
    const credentialDigests = await withOwner(database, async (client) =>
      (
        await client.query(
          "SELECT password FROM public.auth_account WHERE provider_id='credential' ORDER BY id",
        )
      ).rows.map((row) => createHash('sha256').update(row.password).digest('hex')),
    );
    const client = new pg.Client(pgClientConfig(runtimeDatabaseTarget(database.runtimeURL)));
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('guide.workspace_id',$1,true),set_config('guide.actor_kind','anonymous',true),set_config('guide.actor_active','true',true),set_config('guide.actor_id','',true)",
        [workspace],
      );
      const publicGuides = (
        await client.query('SELECT id,document FROM app.published_guides($1)', [workspace])
      ).rows;
      await client.query(
        "SELECT set_config('guide.actor_kind','user',true),set_config('guide.actor_id',$1,true)",
        [actor],
      );
      const managerGuides = (await client.query('SELECT id FROM app.guide ORDER BY id')).rows.map(
        (row) => row.id as string,
      );
      return {
        counts,
        credentialDigests,
        checkpoint: await checkpoint(database),
        publicGuides,
        managerGuides,
        setup: await setupStateAsOwner(database.ownerURL),
      };
    } finally {
      await client.query('ROLLBACK');
      await client.end();
    }
  };
  const seed = async (database: RestoreFixtureDatabase): Promise<void> => {
    await withOwner(database, async (client) => {
      const migrations = readMigrationDirectory(new URL('../migrations', import.meta.url).pathname);
      assertMigrationsMatchBuild(migrations);
      await client.query(
        'CREATE TABLE public.schema_migration(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
      );
      await client.query('GRANT SELECT ON public.schema_migration TO guide_runtime');
      for (const migration of migrations) {
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query('INSERT INTO public.schema_migration(name,checksum) VALUES($1,$2)', [
            migration.name,
            migration.checksum,
          ]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
      await client.query('BEGIN');
      try {
        await client.query(
          "INSERT INTO public.auth_user(id,name,email,email_verified,active) VALUES($1,'Restore fixture manager','restore-fixture@example.test',true,true)",
          [actor],
        );
        await client.query(
          "INSERT INTO public.auth_account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)",
          [randomUUID(), actor, await hashPassword(randomBytes(32).toString('hex'))],
        );
        await client.query(
          "INSERT INTO app.workspace(id,name,audience,root) VALUES($1,'Restore fixture','public',true)",
          [workspace],
        );
        await client.query(
          "INSERT INTO app.membership(workspace_id,actor_id,role) VALUES($1,$2,'manage')",
          [workspace, actor],
        );
        await client.query(
          "INSERT INTO app.category(id,workspace_id,domain,name,visibility) VALUES($1,$2,'guide','Restore fixture','public')",
          [category, workspace],
        );
        await client.query(
          "INSERT INTO app.asset(id,workspace_id,content_hash,media_type,byte_size,width,height,created_by) VALUES($1,$2,$3,'image/webp',$4,1,1,$5)",
          [asset, workspace, file.sha256, file.bytes, actor],
        );
        await client.query(
          "INSERT INTO app.guide(id,workspace_id,audience,state,document,category,category_id,author,current_release,published_version,cover_asset_id) VALUES($1,$2,'public','published',$3,'Restore fixture',$4,'Restore fixture manager',1,1,$5)",
          [guide, workspace, document, category, asset],
        );
        await client.query(
          "INSERT INTO app.release(guide_id,workspace_id,number,draft_version,document,category,category_id,category_path,license,author,is_sample,cover_asset_id) VALUES($1,$2,1,1,$3,'Restore fixture',$4,$5,'CC-BY-4.0','Restore fixture manager',false,$6)",
          [
            guide,
            workspace,
            document,
            category,
            JSON.stringify([{ id: category, name: 'Restore fixture' }]),
            asset,
          ],
        );
        await client.query(
          'INSERT INTO app.asset_reference(workspace_id,asset_id,guide_id,release_number) VALUES($1,$2,$3,0),($1,$2,$3,1)',
          [workspace, asset, guide],
        );
        await client.query(
          "INSERT INTO app.invitation(workspace_id,id,email,role,token_hash,expires_at,invited_by) VALUES($1,$2,'pending@example.test','view',$3,now()+interval '1 day',$4)",
          [
            workspace,
            randomUUID(),
            createHash('sha256').update(randomBytes(32)).digest('hex'),
            actor,
          ],
        );
        await client.query(
          "INSERT INTO public.auth_session(id,expires_at,token,user_id) VALUES($1,now()+interval '1 day',$2,$3)",
          [randomUUID(), randomUUID(), actor],
        );
        await client.query(
          "INSERT INTO public.auth_verification(id,identifier,value,expires_at) VALUES($1,'synthetic-verification','synthetic-value',now()+interval '1 day')",
          [randomUUID()],
        );
        await client.query(
          "INSERT INTO app.rate_limit(key,count,expires_at) VALUES('synthetic-restore-fixture',1,now()+interval '1 hour')",
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  };
  const verifyDatabaseControls = async (): Promise<void> => {
    const database = await newTarget();
    const dbName = checked(database).database;
    const session = await openRestoreSession(database);
    const restoreId = randomUUID(),
      backupId = 'a'.repeat(64);
    try {
      await withOwner(database, (client) =>
        client.query("CREATE COLLATION public.restore_probe (provider='libc',locale='C')"),
      );
      await assert.rejects(session.preflight(), { problem: 'target-not-empty' });
      await assert.rejects(
        session.discard(restoreId, { public: true, runtime: false, runtimeGrantOption: false }),
        { problem: 'discard-refused' },
      );
      await withOwner(database, (client) => client.query('DROP COLLATION public.restore_probe'));
      await withOwner(database, async (client) => {
        await client.query(`REVOKE CONNECT ON DATABASE "${dbName}" FROM PUBLIC`);
        await client.query(
          `GRANT CONNECT ON DATABASE "${dbName}" TO guide_runtime WITH GRANT OPTION`,
        );
      });
      const prior = await session.preflight();
      assert.deepEqual(prior, { public: false, runtime: true, runtimeGrantOption: true });
      const oldRuntime = new pg.Client(pgClientConfig(runtimeDatabaseTarget(database.runtimeURL)));
      oldRuntime.on('error', () => {});
      await oldRuntime.connect();
      try {
        await session.beginRestore(restoreId, 'pending', prior);
        assert.equal(await canConnect(database), false);
        await assert.rejects(oldRuntime.query('SELECT 1'));
      } finally {
        await oldRuntime.end();
      }
      // Simulate a receiving crash after pg_restore committed but before loaded.
      await seed(database);
      await session.discard(restoreId, prior);
      assert.deepEqual(await session.preflight(), prior);
      assert.equal(await canConnect(database), true);
      assert.equal(await checkpoint(database), null);
      console.log(
        'PASS empty-target protection, closed access, session termination and post-load receiving discard',
      );
    } finally {
      await session.release();
    }
    const staged = await newTarget();
    let active = await openRestoreSession(staged);
    const stagedId = randomUUID();
    try {
      const prior = await active.preflight();
      await active.beginRestore(stagedId, 'pending', prior);
      await seed(staged);
      await withOwner(staged, async (client) => {
        await client.query('DELETE FROM public.auth_session');
        await client.query('DELETE FROM public.auth_verification');
        await client.query('DELETE FROM app.rate_limit');
      });
      await active.setBackupId(stagedId, backupId);
      await active.checkpoint(stagedId, 'receiving', 'loaded');
      const inspected = await active.inspectRestored(stagedId);
      assert.equal(inspected.counts['public.auth_session'], 0);
      assert.equal(inspected.counts['public.auth_verification'], 0);
      assert.equal(inspected.counts['app.rate_limit'], 0);
      assert.equal(inspected.assets.length, 1);
      assert.equal(inspected.dangling.length, 0);
      assert.equal(inspected.schema.ok, true);
      await active.checkpoint(stagedId, 'loaded', 'verified');
      await assert.rejects(
        active.applyCredentialPolicy(
          stagedId,
          { openResetLinks: null, pendingInvitations: 0 },
          '2026-01-01T00:00:00Z',
        ),
        { problem: 'credential-counts' },
      );
      assert.equal((await active.readState())!.checkpoint, 'verified');
      assert.equal(
        await withOwner(staged, async (client) =>
          Number((await client.query('SELECT count(*) FROM app.invitation')).rows[0].count),
        ),
        1,
      );
      const report = await active.applyCredentialPolicy(
        stagedId,
        { openResetLinks: null, pendingInvitations: 1 },
        '2026-01-01T00:00:00Z',
      );
      assert.equal(report.accounts, 1);
      assert.equal(report.audit, 'not supported by this version');
      assert.equal((await active.inspectRestored(stagedId)).counts['app.invitation'], 0);
      await active.applyCredentialPolicy(
        stagedId,
        { openResetLinks: null, pendingInvitations: 1 },
        '2026-01-01T00:00:00Z',
      );
      await active.checkpoint(stagedId, 'access-reset', 'media-moved');
      await active.release();
      const wrongURL = new URL(staged.runtimeURL);
      wrongURL.password = randomBytes(24).toString('hex');
      active = await openRestoreSession({ ...staged, runtimeURL: wrongURL.href });
      await assert.rejects(active.activate(stagedId));
      assert.equal((await active.readState())!.checkpoint, 'media-moved');
      assert.equal(await canConnect(staged), false);
      await active.release();
      active = await openRestoreSession(staged);
      await active.activate(stagedId);
      assert.equal(await canConnect(staged), true);
      assert.equal((await active.readState())!.checkpoint, 'active');
      await assert.rejects(active.discard(stagedId, prior), { problem: 'discard-refused' });
      await active.finish(stagedId);
      assert.equal(await checkpoint(staged), null);
      console.log(
        'PASS baseline cleanup rollback and idempotency, wrong-password gate and activation',
      );
    } finally {
      await active.release();
    }
  };
  try {
    const source = await newTarget(),
      target = await newTarget();
    await seed(source);
    assert(await canConnect(source), 'The configured runtime password must already authenticate.');
    await use({
      source,
      target,
      files: [file],
      expected: { workspace, actor, guide, document },
      newTarget,
      snapshot,
      canConnect,
      checkpoint,
      verifyDatabaseControls,
    });
    assert.deepEqual(
      (await admin.query(roleSQL, [runtimeIdentity.user])).rows,
      roleBefore,
      'Restore must not change the shared runtime role.',
    );
    assert(await canConnect(source), 'The original runtime password must still authenticate.');
  } finally {
    const failures: unknown[] = [];
    try {
      for (const name of created) {
        try {
          await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
        } catch (error) {
          failures.push(error);
        }
      }
    } finally {
      await admin.end();
    }
    if (failures.length)
      throw new AggregateError(failures, 'Disposable restore database cleanup failed.');
  }
}
