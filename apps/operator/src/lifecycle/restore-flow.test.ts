import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { performRestore, restoreDatabaseArgument } from './restore-flow';
import { receiveBackup } from './backup-check';
import { runTool } from './run-tool';
import { writeRestoreState } from './staging';
const h = vi.hoisted(() => ({
  db: null as any,
  file: null as any,
  session: {} as any,
  events: [] as string[],
  media: { checked: 0, missing: [], damaged: [], orphanFiles: [] } as any,
}));
vi.mock('@guide/database', () => ({
  openRestoreSession: vi.fn(async () => h.session),
  ownerDatabaseTarget: () => ({ database: 'target' }),
  libpqEnvironment: () => ({}),
}));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(async (path: string) => h.events.push(`mkdir:${path}`)),
  mkdtemp: vi.fn(async () => '/ops-private/passdown-restore-1'),
  chmod: vi.fn(async () => {}),
  rm: vi.fn(async (path: string) => h.events.push(`removed:${path}`)),
}));
vi.mock('node:fs', () => ({ createReadStream: () => ({}) }));
vi.mock('./run-tool', () => ({ runTool: vi.fn(async () => h.events.push('load')) }));
vi.mock('./backup-check', () => ({
  backupFromDirectory: () => ({}),
  receiveBackup: vi.fn(async () => ({ manifest: h.file.manifest, backupId: 'b'.repeat(64) })),
}));
vi.mock('./staging', () => ({
  preflightRestoreRoot: vi.fn(async () => {}),
  initializeRestoreState: vi.fn(async (s: any, state: any) => {
    h.file = state;
  }),
  readRestoreState: vi.fn(async () => h.file),
  writeRestoreState: vi.fn(async (_root: any, state: any) => {
    h.file = { ...state };
  }),
  extractRestoreMedia: vi.fn(async () => []),
  moveRestoreMedia: vi.fn(async () => h.events.push('move')),
  cleanupRestoreFiles: vi.fn(async (_root: any, _id: any, options: any) => {
    h.events.push('cleanup');
    if (options.removeState) h.file = null;
  }),
  restoreStagingPaths: () => ({ run: '/safe/run', media: '/safe/media' }),
}));
vi.mock('./verify-files', () => ({
  verifyMediaFiles: vi.fn(async () => h.media),
  unexpectedMissingMedia: (missing: any[], allowed: any[]) =>
    missing.filter((a) => !allowed.some((b) => a.workspace === b.workspace && a.asset === b.asset)),
}));
const manifest = {
  snapshotAt: '2026-09-25T00:00:00.000Z',
  migrations: [],
  counts: { 'public.auth_session': null },
  credentials: { pendingInvitations: 1, openResetLinks: null },
  media: { missingAtBackup: [] },
};
function context() {
  return {
    ownerURL: 'postgres://owner@localhost/target',
    runtimeURL: 'postgres://guide_runtime@localhost/target',
    policy: 'loopback' as const,
    mediaRoot: '/safe',
    migrationsDirectory: '/migrations',
    out: vi.fn(),
    info: vi.fn(),
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    signal: new AbortController().signal,
  };
}
function state(checkpoint: string) {
  return {
    version: 1,
    restoreId: '11111111-1111-4111-8111-111111111111',
    backupId: 'b'.repeat(64),
    checkpoint,
    manifest,
    previousAccess: { public: true, runtime: false, runtimeGrantOption: false },
    workspaces: [],
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  h.events = [];
  h.media = { checked: 0, missing: [], damaged: [], orphanFiles: [] };
  h.file = state('loaded');
  h.db = { restoreId: h.file.restoreId, backupId: h.file.backupId, checkpoint: 'loaded' };
  h.session = {
    readState: vi.fn(async () => h.db),
    release: vi.fn(async () => {}),
    preflight: vi.fn(async () => h.file.previousAccess),
    beginRestore: vi.fn(async (id: string, backupId: string) => {
      h.db = { restoreId: id, backupId, checkpoint: 'receiving' };
    }),
    setBackupId: vi.fn(async (_id: string, hash: string) => {
      h.db.backupId = hash;
    }),
    checkpoint: vi.fn(async (_id: string, expected: string, next: string) => {
      expect(h.db.checkpoint).toBe(expected);
      h.db.checkpoint = next;
      h.events.push(next);
    }),
    inspectRestored: vi.fn(async () => ({
      counts: { 'public.auth_session': 0 },
      migrations: [],
      assets: [],
      dangling: [],
    })),
    applyCredentialPolicy: vi.fn(async () => {
      h.db.checkpoint = 'access-reset';
      h.events.push('access-reset');
      return { accounts: [] };
    }),
    accessReport: vi.fn(async () => ({ accounts: [] })),
    activate: vi.fn(async () => {
      h.db.checkpoint = 'active';
      h.events.push('active');
    }),
    finish: vi.fn(async () => {
      h.db = null;
      h.events.push('finish');
    }),
    discard: vi.fn(async () => {
      h.db = null;
      h.events.push('discard');
    }),
  };
});
describe('staged restore coordination', () => {
  it('stages the received archive outside the shared media volume and removes it after loading', async () => {
    h.db = null;
    h.file = null;
    h.session.preflight = vi.fn(async () => state('receiving').previousAccess);
    vi.mocked(receiveBackup).mockResolvedValueOnce({
      manifest: manifest as any,
      backupId: 'b'.repeat(64),
    });
    await performRestore({ args: [], options: {} }, context());
    const directory = vi.mocked(receiveBackup).mock.calls[0]![1].directory;
    // The web container can write the media volume; the dump must never sit there.
    expect(directory.startsWith('/safe')).toBe(false);
    expect(h.events.some((event) => event.startsWith('mkdir:/safe'))).toBe(false);
    expect(h.events.slice(0, 3)).toEqual(['load', `removed:${directory}`, 'loaded']);
  });
  it('removes the private archive when loading the database fails', async () => {
    h.db = null;
    h.file = null;
    h.session.preflight = vi.fn(async () => state('receiving').previousAccess);
    vi.mocked(receiveBackup).mockResolvedValueOnce({
      manifest: manifest as any,
      backupId: 'b'.repeat(64),
    });
    vi.mocked(runTool).mockRejectedValueOnce(new Error('pg_restore failed'));
    await expect(performRestore({ args: [], options: {} }, context())).rejects.toThrow(
      'pg_restore failed',
    );
    const directory = vi.mocked(receiveBackup).mock.calls[0]![1].directory;
    expect(h.events).toContain(`removed:${directory}`);
  });
  it('verifies and resets access before moving files and activating', async () => {
    await performRestore({ args: [], options: { activate: true } }, context());
    expect(h.events).toEqual([
      'verified',
      'access-reset',
      'move',
      'media-moved',
      'active',
      'cleanup',
      'finish',
    ]);
    expect(h.session.applyCredentialPolicy).toHaveBeenCalledWith(
      expect.any(String),
      manifest.credentials,
      manifest.snapshotAt,
    );
    expect(h.session.release).toHaveBeenCalledOnce();
  });
  it('uses the database checkpoint and never repeats committed access cleanup', async () => {
    // A crash after the database step but before the file mirror was written.
    h.file = state('verified');
    h.db.checkpoint = 'access-reset';
    await performRestore({ args: [], options: { activate: true } }, context());
    expect(h.session.applyCredentialPolicy).not.toHaveBeenCalled();
    expect(h.events).toEqual(['move', 'media-moved', 'active', 'cleanup', 'finish']);
  });
  it('keeps failed picture verification gated and requires discard', async () => {
    h.media.missing = [{ workspace: 'w', asset: '11111111-1111-4111-8111-111111111111' }];
    await expect(
      performRestore({ args: [], options: { activate: true } }, context()),
    ).rejects.toMatchObject({ exitCode: 1 });
    expect(h.db.checkpoint).toBe('verification-failed');
    expect(h.session.activate).not.toHaveBeenCalled();
    await expect(
      performRestore({ args: [], options: { activate: true } }, context()),
    ).rejects.toMatchObject({ exitCode: 4 });
  });
  it('refuses discard on a normal or already active installation', async () => {
    h.session.preflight.mockRejectedValue(new Error('target-not-empty'));
    for (const db of [null, { ...h.db, checkpoint: 'active' }]) {
      h.db = db;
      await expect(
        performRestore({ args: [], options: { discard: true } }, context()),
      ).rejects.toThrow();
    }
    expect(h.session.discard).not.toHaveBeenCalled();
  });
  it('discards only a matching unfinished restore and keeps files until the database can be reset', async () => {
    await performRestore({ args: [], options: { discard: true } }, context());
    expect(h.events).toEqual(['cleanup', 'discard', 'cleanup']);
  });
  it('finishes after a crash between active file cleanup and clearing the database marker', async () => {
    h.db.checkpoint = 'active';
    h.file = null;
    await performRestore({ args: [], options: { activate: true } }, context());
    expect(h.events).toEqual(['finish']);
    expect(h.session.activate).not.toHaveBeenCalled();
  });
  it('refuses to activate when the database records steps this restore never took', async () => {
    // A crafted dump can rewrite the checkpoint while it loads.
    for (const [recorded, database] of [
      ['receiving', 'media-moved'],
      ['loaded', 'access-reset'],
      ['loaded', 'media-moved'],
    ]) {
      h.file = state(recorded);
      h.db = { ...h.db, checkpoint: database };
      await expect(
        performRestore({ args: [], options: { activate: true } }, context()),
      ).rejects.toMatchObject({ exitCode: 4 });
    }
    expect(h.session.applyCredentialPolicy).not.toHaveBeenCalled();
    expect(h.session.activate).not.toHaveBeenCalled();
  });
  it('keeps a failed activation available for retry without reapplying credential cleanup', async () => {
    h.file = state('access-reset');
    h.db.checkpoint = 'media-moved';
    h.session.activate.mockRejectedValue(new Error('probe refused'));
    await expect(
      performRestore({ args: [], options: { activate: true } }, context()),
    ).rejects.toThrow('probe refused');
    expect(h.db.checkpoint).toBe('media-moved');
    expect(h.session.finish).not.toHaveBeenCalled();
    expect(h.session.applyCredentialPolicy).not.toHaveBeenCalled();
  });
  it('cleans file-only state only after proving the database empty and original access intact', async () => {
    h.db = null;
    await performRestore({ args: [], options: { discard: true } }, context());
    expect(h.session.preflight).toHaveBeenCalledOnce();
    expect(h.session.discard).not.toHaveBeenCalled();
    expect(h.events).toEqual(['cleanup']);
  });
  it('refuses file-only cleanup if original permissions no longer match', async () => {
    h.db = null;
    h.session.preflight.mockResolvedValue({
      public: false,
      runtime: false,
      runtimeGrantOption: false,
    });
    await expect(
      performRestore({ args: [], options: { discard: true } }, context()),
    ).rejects.toMatchObject({ exitCode: 4 });
    expect(h.events).toEqual([]);
  });
  it('finishes active cleanup when the staging run has already been removed', async () => {
    h.db.checkpoint = 'active';
    h.file.checkpoint = 'active';
    vi.mocked(writeRestoreState).mockRejectedValueOnce(new Error('run missing'));
    await performRestore({ args: [], options: { activate: true } }, context());
    expect(writeRestoreState).not.toHaveBeenCalled();
    expect(h.events).toEqual(['cleanup', 'finish']);
    vi.mocked(writeRestoreState)
      .mockReset()
      .mockImplementation(async (_root, state) => {
        h.file = { ...state };
      });
  });
  it('encodes database names as conninfo values without adding another connection parameter', () => {
    expect(restoreDatabaseArgument("db' host=other\\name")).toBe(
      "--dbname=dbname='db\\' host=other\\\\name'",
    );
  });
});
