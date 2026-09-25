import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import type { MediaFileMetadata } from '@guide/contracts';
import pg from 'pg';
import { readMigrationDirectory, migrationLockKey } from '../src/migrator';
import { ownerDatabaseTarget, pgClientConfig, type DatabaseTarget } from '../src/config';
import { openBackupSnapshot, verifyMediaRows } from '../src/lifecycle';

/** Changes only a randomly named disposable database; never resets the source. */
export type LifecycleFixtureFile = MediaFileMetadata & { contents: Buffer };
export async function verifyLifecycle(
  ownerURL: string,
  afterChecks?: (target: DatabaseTarget, files: LifecycleFixtureFile[]) => Promise<void>,
) {
  const name = `passdown_lifecycle_${process.pid}_${randomBytes(4).toString('hex')}`;
  const owner = new URL(ownerURL);
  owner.pathname = '/postgres';
  const admin = new pg.Client(pgClientConfig(ownerDatabaseTarget(owner.href)));
  await admin.connect();
  let created = false;
  let db: pg.Client | undefined;
  let held: Awaited<ReturnType<typeof openBackupSnapshot>> | undefined;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    owner.pathname = `/${name}`;
    const params = ownerDatabaseTarget(owner.href);
    db = new pg.Client(pgClientConfig(params));
    await db.connect();
    await db.query(
      'CREATE TABLE public.schema_migration(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const migrations = readMigrationDirectory(new URL('../migrations', import.meta.url).pathname);
    for (const migration of migrations) {
      await db.query(migration.sql);
      await db.query('INSERT INTO public.schema_migration(name,checksum) VALUES($1,$2)', [
        migration.name,
        migration.checksum,
      ]);
    }
    // Corrupt references are intentionally seeded only in this disposable database.
    // This also checks constrained references should an older import bypass them.
    await db.query('SET session_replication_role=replica');
    await db.query(
      "INSERT INTO app.workspace(id,name,audience) VALUES('snapshot-a','A','public'),('snapshot-b','B','private')",
    );
    await db.query(`INSERT INTO app.asset(id,workspace_id,content_hash,media_type,byte_size,width,height,created_by)
      VALUES('11111111-1111-4111-8111-111111111111','snapshot-a',repeat('a',64),'image/webp',14,1,1,'test'),
            ('22222222-2222-4222-8222-222222222222','snapshot-b',repeat('b',64),'image/webp',15,1,1,'test')`);
    await db.query(
      `INSERT INTO app.guide(id,workspace_id,audience,document,category,author,cover_asset_id,category_id)
      VALUES('guide-a','snapshot-a','public',$1,'Test','Test','missing-guide-cover','category-a')`,
      [
        {
          steps: [
            {
              media: [
                { assetId: '11111111-1111-4111-8111-111111111111' },
                { assetId: 'missing-draft' },
                { assetId: '22222222-2222-4222-8222-222222222222' },
              ],
              body: [{ nested: { assetId: 'missing-nested' } }],
            },
          ],
        },
      ],
    );
    await db.query(
      `INSERT INTO app.release(guide_id,workspace_id,number,draft_version,document,category,license,cover_asset_id,category_id,author,is_sample,category_path)
      VALUES('guide-a','snapshot-a',1,1,$1,'Test','CC-BY-4.0','missing-release-cover','category-a','Test',false,'[]'::jsonb)`,
      [
        {
          steps: [
            {
              media: [
                { assetId: 'missing-release' },
                { assetId: '22222222-2222-4222-8222-222222222222' },
              ],
            },
          ],
        },
      ],
    );
    await db.query(
      "INSERT INTO app.category(id,workspace_id,domain,name,visibility,image_asset_id,code) VALUES('category-a','snapshot-a','guide','A','public','22222222-2222-4222-8222-222222222222','TEST-CATEGORY')",
    );
    await db.query(
      "INSERT INTO app.asset_reference(workspace_id,asset_id,guide_id) VALUES('snapshot-a','missing-reference','guide-a')",
    );
    await db.query('SET session_replication_role=origin');
    const outcomes: Array<[string, () => Promise<void>]> = [
      [
        'reports every reference source and rejects a foreign-workspace asset',
        async () => {
          const rows = await verifyMediaRows(params);
          assert.deepEqual(
            rows.assets.map((asset: { asset: string }) => asset.asset),
            ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
          );
          assert.deepEqual(
            rows.dangling
              .map((ref: { source: string; asset: string }) => `${ref.source}:${ref.asset}`)
              .sort(),
            [
              'guide-document:missing-draft',
              'guide-document:missing-nested',
              'guide-document:22222222-2222-4222-8222-222222222222',
              'release-document:missing-release',
              'release-document:22222222-2222-4222-8222-222222222222',
              'guide-cover:missing-guide-cover',
              'release-cover:missing-release-cover',
              'category-image:22222222-2222-4222-8222-222222222222',
              'asset-reference:missing-reference',
            ].sort(),
          );
          assert(
            rows.dangling.every((ref: { workspace: string }) => ref.workspace === 'snapshot-a'),
          );
        },
      ],
      [
        'exports a stable snapshot and excludes transient table counts',
        async () => {
          held = await openBackupSnapshot(params);
          // Open reset links are counted once their table exists (migration 032).
          const resets = (
            await db!.query("SELECT to_regclass('app.password_reset') IS NOT NULL AS present")
          ).rows[0].present;
          assert.equal(held.credentials.openResetLinks, resets ? 0 : null);
          assert.equal(held.counts['public.auth_session'], null);
          assert.equal(held.counts['public.auth_verification'], null);
          assert.equal(held.counts['app.rate_limit'], null);
          assert.equal(held.migrations.length, migrations.length);
          await db!.query(
            "INSERT INTO app.workspace(id,name,audience) VALUES('after-snapshot','Later','private')",
          );
          const importer = new pg.Client(pgClientConfig(params));
          await importer.connect();
          try {
            await importer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            assert(/^[0-9A-Fa-f-]+$/.test(held.id));
            await importer.query(`SET TRANSACTION SNAPSHOT '${held.id}'`);
            assert.equal(
              Number((await importer.query('SELECT count(*) FROM app.workspace')).rows[0].count),
              held.counts['app.workspace'],
            );
            await assert.rejects(
              importer.query(
                "INSERT INTO app.workspace(id,name,audience) VALUES('refused','Refused','private')",
              ),
              { code: '25006' },
            );
          } finally {
            await importer.query('ROLLBACK');
            await importer.end();
          }
          await held.release();
          held = undefined;
        },
      ],
      [
        'refuses migration contention and releases its own advisory lock',
        async () => {
          await db!.query('SELECT pg_advisory_lock($1)', [migrationLockKey]);
          try {
            await assert.rejects(openBackupSnapshot(params), { problem: 'migration-running' });
          } finally {
            await db!.query('SELECT pg_advisory_unlock($1)', [migrationLockKey]);
          }
          held = await openBackupSnapshot(params);
          assert.equal(
            (await db!.query('SELECT pg_try_advisory_lock($1) AS locked', [migrationLockKey]))
              .rows[0].locked,
            false,
          );
          await held.release();
          held = undefined;
          assert.equal(
            (await db!.query('SELECT pg_try_advisory_lock($1) AS locked', [migrationLockKey]))
              .rows[0].locked,
            true,
          );
          await db!.query('SELECT pg_advisory_unlock($1)', [migrationLockKey]);
        },
      ],
    ];
    const failures: unknown[] = [];
    for (const [label, run] of outcomes) {
      try {
        await run();
        console.log(`PASS ${label}`);
      } catch (error) {
        failures.push(error);
        console.log(`FAIL ${label}`);
      } finally {
        await held?.release();
        held = undefined;
      }
    }
    if (failures.length)
      throw new AggregateError(failures, `${failures.length} lifecycle checks failed`);
    if (afterChecks) {
      // Leave a clean, private fixture for the combined backup rehearsal. Its
      // lifetime stays inside this function's guaranteed database cleanup.
      await db.query(
        `UPDATE app.guide SET document='{"steps":[{"media":[{"assetId":"11111111-1111-4111-8111-111111111111"}]}]}'::jsonb,cover_asset_id='11111111-1111-4111-8111-111111111111'`,
      );
      await db.query(
        `UPDATE app.release SET document='{"steps":[{"media":[{"assetId":"11111111-1111-4111-8111-111111111111"}]}]}'::jsonb,cover_asset_id='11111111-1111-4111-8111-111111111111'`,
      );
      await db.query(
        "UPDATE app.category SET image_asset_id='11111111-1111-4111-8111-111111111111'",
      );
      await db.query('DELETE FROM app.asset_reference');
      await db.query(
        "INSERT INTO app.asset_reference(workspace_id,asset_id,guide_id) VALUES('snapshot-a','11111111-1111-4111-8111-111111111111','guide-a')",
      );
      const contents = Buffer.from(
        'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
        'base64',
      );
      const sha256 = createHash('sha256').update(contents).digest('hex');
      await db.query('UPDATE app.asset SET byte_size=$1,content_hash=$2', [
        contents.length,
        sha256,
      ]);
      const files = ['a', 'b'].map((suffix) => ({
        workspace: `snapshot-${suffix}`,
        asset:
          suffix === 'a'
            ? '11111111-1111-4111-8111-111111111111'
            : '22222222-2222-4222-8222-222222222222',
        bytes: contents.length,
        sha256,
        contents,
      }));
      await afterChecks(params, files);
    }
  } finally {
    await held?.release();
    await db?.end();
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
}
