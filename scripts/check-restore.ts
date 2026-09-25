import assert from 'node:assert/strict';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { mediaFileName } from '@guide/contracts';
import { expectedMigrations } from '@guide/database';
import { backupCommand } from '../apps/operator/src/commands/backup';
import { restoreCommand } from '../apps/operator/src/commands/restore';
import { OperatorFailure, type OperatorContext } from '../apps/operator/src/command';
import { withRestoreFixture } from '../packages/database/test/restore-fixture';
import { readConfig } from './local-config.mjs';

/** Real PostgreSQL/operator rehearsal; all SQL and disposable DB ownership stay in the fixture. */
async function main() {
  const config = readConfig();
  if (!config.GUIDE_OWNER_DATABASE_URL || !config.GUIDE_DATABASE_URL)
    throw new Error('Existing local owner and runtime settings are required.');
  const directory = await mkdtemp(join(tmpdir(), 'passdown-restore-rehearsal-'));
  try {
    await withRestoreFixture(
      config.GUIDE_OWNER_DATABASE_URL,
      config.GUIDE_DATABASE_URL,
      async (fixture) => {
        await fixture.verifyDatabaseControls();
        const sourceMedia = join(directory, 'source-media'),
          targetMedia = join(directory, 'target-media');
        await mkdir(sourceMedia, { mode: 0o700 });
        await mkdir(targetMedia, { mode: 0o700 });
        for (const file of fixture.files) {
          const path = join(sourceMedia, mediaFileName(file.workspace, file.asset));
          await mkdir(dirname(path), { recursive: true, mode: 0o700 });
          await writeFile(path, file.contents, { flag: 'wx', mode: 0o600 });
        }
        const before = await fixture.snapshot(fixture.source);
        assert.equal(before.counts['public.auth_session'], 1);
        assert.equal(before.counts['public.auth_verification'], 1);
        assert.equal(before.counts['app.invitation'], 1);
        assert.equal(before.setup, 'complete');
        assert.deepEqual(before.publicGuides, [
          { id: fixture.expected.guide, document: fixture.expected.document },
        ]);
        const signal = new AbortController().signal;
        const messages: string[] = [];
        const context = (target: typeof fixture.source, mediaRoot: string): OperatorContext => ({
          ...target,
          mediaRoot,
          policy: 'loopback',
          migrationsDirectory: new URL('../packages/database/migrations', import.meta.url).pathname,
          signal,
          stdin: Readable.from([]),
          stdout: new Writable({
            write(_chunk, _encoding, done) {
              done();
            },
          }),
          out: (message) => messages.push(message),
          info: (message) => messages.push(message),
        });
        const archive = join(directory, 'backup.tar');
        await backupCommand.run(
          { args: [], options: {} },
          {
            ...context(fixture.source, sourceMedia),
            stdout: createWriteStream(archive, { flags: 'wx', mode: 0o600 }),
          },
        );
        console.log('PASS valid source snapshot and real custom-format backup');
        await restoreCommand.run(
          { args: [], options: {} },
          { ...context(fixture.target, targetMedia), stdin: createReadStream(archive) },
        );
        const restored = await fixture.snapshot(fixture.target);
        assert.equal(restored.counts['public.auth_user'], 1);
        assert.equal(restored.counts['public.auth_account'], 1);
        assert.deepEqual(restored.credentialDigests, before.credentialDigests);
        assert.equal(restored.counts['app.membership'], 1);
        assert.equal(restored.counts['app.guide'], 1);
        assert.equal(restored.counts['app.release'], 1);
        assert.equal(restored.counts['app.asset'], 1);
        assert.equal(restored.counts['public.schema_migration'], expectedMigrations().length);
        assert.equal(restored.counts['public.auth_session'], 0);
        assert.equal(restored.counts['public.auth_verification'], 0);
        assert.equal(restored.counts['app.rate_limit'], 0);
        assert.equal(restored.counts['app.invitation'], 0);
        assert.equal(restored.checkpoint, null);
        assert.equal(restored.setup, 'complete');
        assert.deepEqual(restored.publicGuides, before.publicGuides);
        assert.deepEqual(restored.managerGuides, [fixture.expected.guide]);
        assert(await fixture.canConnect(fixture.target));
        for (const file of fixture.files)
          assert.deepEqual(
            await readFile(join(targetMedia, mediaFileName(file.workspace, file.asset))),
            file.contents,
          );
        assert(
          !(await readdir(targetMedia)).includes('.passdown-restore'),
          'Completed restore must remove its staging state.',
        );
        console.log(
          'PASS restored rows, original pictures, runtime access, public reader and closed setup',
        );
        console.log('PASS excluded transient data and cancelled pending invitations');
        await assert.rejects(
          restoreCommand.run(
            { args: [], options: {} },
            { ...context(fixture.target, targetMedia), stdin: Readable.from([]) },
          ),
          (error) => error instanceof OperatorFailure && error.exitCode === 4,
        );
        assert.deepEqual(await fixture.snapshot(fixture.target), restored);
        const retryTarget = await fixture.newTarget();
        const retryMedia = join(directory, 'retry-media');
        await mkdir(retryMedia, { mode: 0o700 });
        const wrongRuntime = new URL(retryTarget.runtimeURL);
        wrongRuntime.password = 'deliberately-incorrect-restore-fixture-password';
        await assert.rejects(
          restoreCommand.run(
            { args: [], options: {} },
            {
              ...context({ ...retryTarget, runtimeURL: wrongRuntime.href }, retryMedia),
              stdin: createReadStream(archive),
            },
          ),
        );
        assert.match((await fixture.checkpoint(retryTarget))!, / media-moved$/);
        assert.equal(await fixture.canConnect(retryTarget), false);
        await restoreCommand.run(
          { args: [], options: { activate: true } },
          context(retryTarget, retryMedia),
        );
        assert.equal(await fixture.checkpoint(retryTarget), null);
        assert.equal(await fixture.canConnect(retryTarget), true);
        assert.deepEqual((await fixture.snapshot(retryTarget)).publicGuides, before.publicGuides);
        assert.equal((await fixture.snapshot(retryTarget)).counts['app.invitation'], 0);
        console.log(
          'PASS full command resumes after a rejected password without repeating access cleanup',
        );
        assert.deepEqual(await fixture.snapshot(fixture.source), before);
        console.log(
          'PASS existing installation refusal leaves source and restored target unchanged',
        );
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(
    `FAIL restore rehearsal (${error instanceof Error ? error.name : 'unknown error'}).`,
  );
  process.exitCode = 1;
});
