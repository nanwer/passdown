import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { backupCommand, digestFile } from '../commands/backup';
import { openBackupSnapshot, expectedMigrations } from '@guide/database';
import { runTool } from './run-tool';
import { readTar } from './ustar';
vi.mock('@guide/database', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openBackupSnapshot: vi.fn(),
}));
vi.mock('./run-tool', () => ({ runTool: vi.fn() }));
const sha = 'a'.repeat(64);
function snapshot() {
  return {
    id: 'snapshot-1',
    snapshotAt: new Date().toISOString(),
    databaseName: 'test',
    serverVersion: '17.6',
    migrations: expectedMigrations(),
    counts: {
      'public.auth_session': null,
      'public.auth_verification': null,
      'app.rate_limit': null,
    },
    assets: [],
    credentials: { openResetLinks: null, pendingInvitations: 0 },
    dangling: [],
    references: [],
    release: vi.fn(async () => {}),
  };
}
async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'passdown-backup-test-'));
  const chunks: Buffer[] = [];
  const context = {
    ownerURL: 'postgres://owner:password@127.0.0.1:5432/test',
    policy: 'loopback' as const,
    mediaRoot: root,
    migrationsDirectory: root,
    out: vi.fn(),
    info: vi.fn(),
    stdin: new PassThrough(),
    stdout: new Writable({
      write(chunk, _enc, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    }),
    signal: new AbortController().signal,
  };
  vi.mocked(runTool).mockImplementation(async (_tool, args, o) => {
    const data = Buffer.from(
      args.includes('--version') ? 'pg_dump (PostgreSQL) 17.6\n' : 'PGDMP-test',
    );
    await new Promise<void>((resolve, reject) => {
      o.output!.once('error', reject);
      o.output!.end(data, resolve);
    });
  });
  return { root, context, chunks, cleanup: () => rm(root, { recursive: true, force: true }) };
}
describe('backup command', () => {
  it('streams one archive without log bytes and omits active session tables from dump', async () => {
    const h = await harness();
    const s = snapshot();
    vi.mocked(openBackupSnapshot).mockImplementation(async () => {
      s.snapshotAt = new Date().toISOString();
      return s;
    });
    try {
      await backupCommand.run({ args: [], options: {} }, h.context);
      const names: string[] = [];
      let manifest: any;
      for await (const member of readTar(
        (async function* () {
          yield Buffer.concat(h.chunks);
        })(),
      )) {
        names.push(member.name);
        const chunks = [];
        for await (const chunk of member.content) chunks.push(Buffer.from(chunk));
        if (member.name === 'manifest.json')
          manifest = JSON.parse(Buffer.concat(chunks).toString());
      }
      expect(names).toEqual(['database.dump', 'media.tar', 'manifest.json', 'SHA256SUMS']);
      expect(manifest.format).toBe('passdown-backup/1');
      expect(manifest.complete).toBe(true);
      expect(manifest.media).toMatchObject({
        files: 0,
        bytes: 0,
        missingAtBackup: [],
        renditionsIncluded: false,
      });
      expect(manifest.files['database.dump'].bytes).toBe(10);
      const dump = vi.mocked(runTool).mock.calls.find((c) => c[1].includes('--format=custom'))!;
      expect(dump[1]).toEqual(
        expect.arrayContaining([
          '--exclude-table-data=public.auth_session',
          '--exclude-table-data=public.auth_verification',
          '--exclude-table-data=app.rate_limit',
          '--snapshot=snapshot-1',
        ]),
      );
      expect(dump[1].join(' ')).not.toContain('password');
      expect(s.release).toHaveBeenCalled();
      expect(h.context.out).not.toHaveBeenCalled();
    } finally {
      await h.cleanup();
    }
  });
  it('refuses missing files before producing any archive and releases its snapshot', async () => {
    const h = await harness();
    const s = {
      ...snapshot(),
      assets: [
        { workspace: 'w', asset: '11111111-1111-1111-1111-111111111111', bytes: 1, sha256: sha },
      ],
    };
    vi.mocked(openBackupSnapshot).mockImplementation(async () => {
      s.snapshotAt = new Date().toISOString();
      return s;
    });
    try {
      await expect(backupCommand.run({ args: [], options: {} }, h.context)).rejects.toMatchObject({
        exitCode: 4,
      });
      expect(h.chunks).toHaveLength(0);
      expect(s.release).toHaveBeenCalled();
    } finally {
      await h.cleanup();
    }
  });
  it('records explicitly allowed missing pictures and creates private exclusive output directories', async () => {
    const h = await harness();
    const s = {
      ...snapshot(),
      assets: [
        { workspace: 'w', asset: '11111111-1111-1111-1111-111111111111', bytes: 1, sha256: sha },
      ],
    };
    vi.mocked(openBackupSnapshot).mockImplementation(async () => {
      s.snapshotAt = new Date().toISOString();
      return s;
    });
    try {
      await backupCommand.run(
        { args: [], options: { output: h.root, 'allow-missing-media': true } },
        h.context,
      );
      const names = await readdir(h.root);
      expect(names).toHaveLength(1);
      expect(names[0]).toMatch(/^passdown-/);
      expect(h.chunks).toHaveLength(0);
      expect(h.context.info).toHaveBeenCalled();
    } finally {
      await h.cleanup();
    }
  });
  it('removes the private dump even when closing the snapshot fails', async () => {
    const h = await harness();
    const s = snapshot();
    s.release.mockRejectedValue(new Error('disconnected'));
    vi.mocked(openBackupSnapshot).mockImplementation(async () => {
      s.snapshotAt = new Date().toISOString();
      return s;
    });
    try {
      await expect(backupCommand.run({ args: [], options: {} }, h.context)).rejects.toThrow(
        'disconnected',
      );
      const call = [...vi.mocked(runTool).mock.calls]
        .reverse()
        .find((c) => c[1].includes('--format=custom'))!;
      const path = (call[2].output as unknown as { path: string }).path;
      await expect(stat(dirname(path))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await h.cleanup();
    }
  });

  it('cancels dump hashing before reading a file when interrupted', async () => {
    const h = await harness();
    const path = join(h.root, 'dump');
    await writeFile(path, 'dump');
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(digestFile(path, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
    } finally {
      await h.cleanup();
    }
  });
});
