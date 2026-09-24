import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { ensureRuntimeRole, RuntimeRoleError, runtimeRoleIsSafeFor } from '../src/runtime-role';
import {
  applyMigrations,
  readMigrationDirectory,
  MigrationFailure,
  MigrationValidationError,
  migrationLockKey,
  readSchemaStateAsOwner,
} from '../src/migrator';
import { completeSetup, setupStateAsOwner } from '../src/setup';
import { ownerDatabaseTarget, pgClientConfig } from '../src/config';

/** Every object changed here has a disposable name; the existing runtime role is never altered. */
export async function verifyMigrator(
  ownerURL: string,
  runtimeURL: string,
  report?: (name: string, fn: () => Promise<void>) => Promise<void>,
) {
  const owner = new URL(ownerURL),
    runtime = new URL(runtimeURL);
  const suffix = `${process.pid}_${randomBytes(4).toString('hex')}`;
  const database = `passdown_migrator_${suffix}`,
    role = `passdown_probe_${suffix}`,
    group = `passdown_group_${suffix}`;
  const adminURL = new URL(owner);
  adminURL.pathname = '/postgres';
  const admin = new pg.Client(pgClientConfig(ownerDatabaseTarget(adminURL.href)));
  const checks: string[] = [];
  const check = async (name: string, fn: () => Promise<void>) => {
    if (report) await report(name, fn);
    else {
      await fn();
      console.log(`PASS ${name}`);
    }
    checks.push(name);
  };
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  owner.pathname = runtime.pathname = `/${database}`;
  const db = new pg.Client(pgClientConfig(ownerDatabaseTarget(owner.href)));
  await db.connect();
  const probeURL = new URL(runtime);
  probeURL.username = role;
  probeURL.password = 'disposable-probe-password';
  const ensure = (extra = {}) =>
    ensureRuntimeRole({
      ownerURL: owner.href,
      runtimeURL: probeURL.href,
      role,
      probeDatabase: 'postgres',
      ...extra,
    });
  const denied = async (
    problem: RuntimeRoleError['problem'],
    operation: () => Promise<unknown>,
  ) => {
    await assert.rejects(
      operation,
      (e: unknown) => e instanceof RuntimeRoleError && e.problem === problem,
    );
  };
  try {
    await check('reports an unmigrated installation as setup required', async () => {
      assert.equal(await setupStateAsOwner(owner.href), 'required');
    });
    await check('creates a safe disposable role and proves its password', async () => {
      assert.deepEqual(await ensure(), { created: true, passwordChanged: false });
      assert.equal((await db.query(runtimeRoleIsSafeFor(role))).rows[0].safe, true);
      assert.deepEqual(await ensure(), { created: false, passwordChanged: false });
    });
    await check('refuses unsafe attributes without silently changing them', async () => {
      await admin.query(`ALTER ROLE "${role}" CREATEROLE`);
      await denied('attributes', () => ensure({ setPassword: true }));
      assert.equal(
        (await admin.query('SELECT rolcreaterole FROM pg_roles WHERE rolname=$1', [role])).rows[0]
          .rolcreaterole,
        true,
      );
      assert.equal((await db.query(runtimeRoleIsSafeFor(role))).rows[0].safe, false);
      await admin.query(`ALTER ROLE "${role}" NOCREATEROLE`);
    });
    await check('refuses membership and ownership', async () => {
      await admin.query(`CREATE ROLE "${group}" NOLOGIN`);
      await admin.query(`GRANT "${group}" TO "${role}"`);
      await denied('membership', () => ensure());
      await admin.query(`REVOKE "${group}" FROM "${role}"`);
      await db.query(`CREATE SCHEMA owned_probe AUTHORIZATION "${role}"`);
      await denied('ownership', () => ensure());
      await db.query('DROP SCHEMA owned_probe');
    });
    await check('requires schema privileges after migrations', async () => {
      await denied('privileges', () => ensure({ phase: 'after-schema' }));
    });
    await check(
      'proves and aligns passwords through postgres without reopening the closed target',
      async () => {
        await db.query(
          'CREATE SCHEMA app; CREATE TABLE public.schema_migration(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
        );
        await db.query(
          `GRANT USAGE ON SCHEMA app TO "${role}"; GRANT SELECT ON public.schema_migration TO "${role}"`,
        );
        await admin.query(`REVOKE CONNECT ON DATABASE "${database}" FROM PUBLIC, "${role}"`);
        const cannotConnect = async () => {
          const c = new pg.Client({ connectionString: probeURL.href });
          try {
            await assert.rejects(c.connect(), /permission denied for database/);
          } finally {
            await c.end();
          }
        };
        await cannotConnect();
        const wrong = new URL(probeURL);
        wrong.password = 'wrong-password';
        await denied('password', () => ensure({ runtimeURL: wrong.href, phase: 'after-schema' }));
        await cannotConnect();
        assert.deepEqual(
          await ensure({ runtimeURL: wrong.href, setPassword: true, phase: 'after-schema' }),
          { created: false, passwordChanged: true },
        );
        await denied('password', () => ensure({ phase: 'after-schema' }));
        await ensure({ setPassword: true, phase: 'after-schema' });
        await cannotConnect();
        assert.equal(
          (
            await admin.query("SELECT has_database_privilege($1,$2,'CONNECT') AS allowed", [
              role,
              database,
            ])
          ).rows[0].allowed,
          false,
        );
        // Only this test harness reopens its own disposable target for migration tests.
        await admin.query(`GRANT CONNECT ON DATABASE "${database}" TO PUBLIC`);
        await db.query('DROP SCHEMA app; DROP TABLE public.schema_migration');
      },
    );
    const migrations = readMigrationDirectory(new URL('../migrations', import.meta.url).pathname);
    await check('waits for the migration lock then applies the real schema once', async () => {
      await db.query('SELECT pg_advisory_lock($1)', [migrationLockKey]);
      let waiting!: () => void;
      const waited = new Promise<void>((r) => {
        waiting = r;
      });
      const running = applyMigrations({
        ownerURL: owner.href,
        runtimeURL: runtime.href,
        migrations,
        onWaiting: waiting,
      });
      await Promise.race([
        waited,
        new Promise((_, reject) =>
          setTimeout(() => reject(Error('runner never reported waiting')), 5000),
        ),
      ]);
      await db.query('SELECT pg_advisory_unlock($1)', [migrationLockKey]);
      assert.deepEqual(await running, {
        applied: migrations.map((f) => f.name),
        total: migrations.length,
      });
      assert.deepEqual(
        await applyMigrations({ ownerURL: owner.href, runtimeURL: runtime.href, migrations }),
        { applied: [], total: migrations.length },
      );
      assert.deepEqual(await readSchemaStateAsOwner(owner.href), {
        ok: true,
        applied: migrations.length,
        ahead: [],
      });
    });
    await check(
      'rejects database-owner membership even when app.guide has a different owner',
      async () => {
        await admin.query(`ALTER DATABASE "${database}" OWNER TO "${group}"`);
        await admin.query(`GRANT "${group}" TO "${role}"`);
        try {
          assert.equal((await db.query(runtimeRoleIsSafeFor(role))).rows[0].safe, false);
        } finally {
          await admin.query(`REVOKE "${group}" FROM "${role}"`);
          await admin.query(
            `ALTER DATABASE "${database}" OWNER TO ${pg.escapeIdentifier(decodeURIComponent(owner.username))}`,
          );
        }
      },
    );
    await check(
      'setup bounds a blocked transaction and reads committed state despite a database default',
      async () => {
        await db.query(
          'ALTER DATABASE "' +
            database +
            "\" SET default_transaction_isolation = 'repeatable read'",
        );
        const pool = new pg.Pool({
          connectionString: runtime.href,
          options: '-c statement_timeout=7000',
        });
        try {
          const input = {
            email: 'migrator-setup@example.org',
            name: 'Operator',
            password: 'disposable setup password',
            workspaceName: 'Migration test',
          };
          assert.equal(await setupStateAsOwner(owner.href), 'required');
          await db.query('BEGIN');
          await db.query('SELECT pg_advisory_xact_lock(719821009)');
          const start = Date.now();
          assert.equal((await completeSetup(pool, input)).outcome, 'rolled-back');
          assert.ok(Date.now() - start < 6500, 'setup lock wait must be bounded');
          await db.query('ROLLBACK');
          const results = await Promise.all([
            completeSetup(pool, input),
            completeSetup(pool, input),
          ]);
          assert.deepEqual(results.map((r) => r.outcome).sort(), ['already-set-up', 'created']);
          assert.equal(await setupStateAsOwner(owner.href), 'complete');
          await db.query('TRUNCATE public.auth_user CASCADE');
          assert.deepEqual(await completeSetup(pool, input), { outcome: 'workspace-exists' });
          assert.equal(
            (await db.query('SELECT count(*)::int AS count FROM public.auth_user')).rows[0].count,
            0,
          );
        } finally {
          await pool.end();
          await db.query('ROLLBACK');
        }
      },
    );
    await check('refuses an applied checksum change before running any pending file', async () => {
      const sql = 'CREATE TABLE public.should_not_exist(id int);';
      const pending = {
        name: '000_pending.sql',
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
      const changed = migrations.map((f, i) =>
        i
          ? f
          : {
              ...f,
              sql: f.sql + '\n',
              checksum: createHash('sha256')
                .update(f.sql + '\n')
                .digest('hex'),
            },
      );
      await assert.rejects(
        applyMigrations({
          ownerURL: owner.href,
          runtimeURL: runtime.href,
          migrations: [pending, ...changed],
        }),
        (error: unknown) =>
          error instanceof MigrationValidationError &&
          error.problem === 'applied-changed' &&
          error.migration === '001_application.sql' &&
          error.message === 'Applied migration changed: 001_application.sql',
      );
      assert.equal(
        (await db.query("SELECT to_regclass('public.should_not_exist') AS relation")).rows[0]
          .relation,
        null,
      );
    });
    await check('names a failed migration and rolls back its SQL and receipt', async () => {
      const sql =
        'CREATE TABLE public.failed_migration_probe(id int); SELECT definitely_missing_function();';
      const failure = {
        name: '999_failure_probe.sql',
        sql,
        checksum: createHash('sha256').update(sql).digest('hex'),
      };
      await assert.rejects(
        applyMigrations({
          ownerURL: owner.href,
          runtimeURL: runtime.href,
          migrations: [...migrations, failure],
        }),
        (e: unknown) =>
          e instanceof MigrationFailure &&
          e.migration === failure.name &&
          e.outcome === 'rolled-back',
      );
      assert.equal(
        (await db.query("SELECT to_regclass('public.failed_migration_probe') AS relation")).rows[0]
          .relation,
        null,
      );
      assert.equal(
        (await db.query('SELECT 1 FROM public.schema_migration WHERE name=$1', [failure.name]))
          .rowCount,
        0,
      );
    });
    return checks;
  } finally {
    await db.end();
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS "${role}"; DROP ROLE IF EXISTS "${group}"`);
    await admin.end();
  }
}
if (process.argv[1]?.endsWith('/migrator-integration.ts')) {
  const settings = Object.fromEntries(
    readFileSync(process.env.PASSDOWN_TEST_SETTINGS ?? '.env.local', 'utf8')
      .split('\n')
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')];
      }),
  );
  await verifyMigrator(settings.GUIDE_OWNER_DATABASE_URL!, settings.GUIDE_DATABASE_URL!);
}
