import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
  rename,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mediaFileName } from '@guide/contracts';
import { expectedMigrations } from '@guide/database';
import { tarArchive } from './ustar';
import type { BackupManifest } from './manifest';
import {
  preflightRestoreRoot,
  initializeRestoreState,
  readRestoreState,
  writeRestoreState,
  restoreStagingPaths,
  extractRestoreMedia,
  moveRestoreMedia,
  cleanupRestoreFiles,
  type RestoreFileState,
} from './staging';
vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
let temp: string, root: string;
const restoreId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const asset = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const manifest = (): BackupManifest => ({
  format: 'passdown-backup/1',
  complete: true,
  createdBy: { passdown: '0.1.0-alpha.1', revision: 'abc1234' },
  startedAt: '2026-09-25T10:00:00.000Z',
  snapshotAt: '2026-09-25T10:00:01.000Z',
  completedAt: '2026-09-25T10:00:02.000Z',
  database: { name: 'test', server: '17.6', pgDump: '17.6' },
  migrations: expectedMigrations(),
  counts: {
    'app.guide': 0,
    'public.auth_session': null,
    'public.auth_verification': null,
    'app.rate_limit': null,
  },
  excludedData: ['public.auth_session', 'public.auth_verification', 'app.rate_limit'],
  credentials: { openResetLinks: 0, pendingInvitations: 0 },
  media: { files: 1, bytes: 7, missingAtBackup: [], renditionsIncluded: false },
  files: {
    'database.dump': { bytes: 1, sha256: 'a'.repeat(64) },
    'media.tar': { bytes: 2048, sha256: 'b'.repeat(64) },
  },
});
const state = (): RestoreFileState => ({
  version: 1,
  restoreId,
  backupId: 'a'.repeat(64),
  checkpoint: 'receiving',
  manifest: manifest(),
  previousAccess: { public: true, runtime: false, runtimeGrantOption: false },
  workspaces: [],
});
const bytes = async function* (value = 'picture') {
  yield Buffer.from(value);
};
const archive = (workspace = 'workshop') =>
  tarArchive([{ name: mediaFileName(workspace, asset), size: 7, content: bytes() }]);
beforeEach(async () => {
  temp = await realpath(await mkdtemp(join(tmpdir(), 'passdown-stage-test-')));
  root = join(temp, 'media');
  await mkdir(root);
});
afterEach(async () => {
  await rm(temp, { recursive: true, force: true });
});
it('creates restrictive durable state, reads updates, and refuses a second initialization', async () => {
  await preflightRestoreRoot(root);
  await initializeRestoreState(root, state());
  expect(await readRestoreState(root)).toEqual(state());
  const paths = restoreStagingPaths(root, restoreId);
  expect((await stat(paths.control)).mode & 0o777).toBe(0o700);
  expect((await stat(paths.run)).mode & 0o777).toBe(0o700);
  expect((await stat(paths.state)).mode & 0o777).toBe(0o600);
  await expect(initializeRestoreState(root, state())).rejects.toThrow();
  const updated = { ...state(), checkpoint: 'loaded' as const };
  await writeRestoreState(root, updated);
  expect(await readRestoreState(root)).toEqual(updated);
  expect(await readdir(paths.control)).toEqual(expect.arrayContaining(['state.json', restoreId]));
  await expect(writeRestoreState(root, { ...updated, restoreId: otherId })).rejects.toThrow();
});
it('refuses occupied roots, symlink roots and corrupt or symlink state', async () => {
  await writeFile(join(root, 'keep'), 'untouched');
  await expect(preflightRestoreRoot(root)).rejects.toThrow();
  await rm(join(root, 'keep'));
  await symlink(root, join(temp, 'linked'));
  await expect(preflightRestoreRoot(join(temp, 'linked'))).rejects.toThrow();
  await initializeRestoreState(root, state());
  const paths = restoreStagingPaths(root, restoreId);
  await writeFile(paths.state, '{"bad":true}');
  await expect(readRestoreState(root)).rejects.toThrow();
  await rm(paths.state);
  await writeFile(join(temp, 'outside'), '{}');
  await symlink(join(temp, 'outside'), paths.state);
  await expect(readRestoreState(root)).rejects.toThrow();
  await expect(writeRestoreState(root, state())).rejects.toThrow();
  expect(await readFile(join(temp, 'outside'), 'utf8')).toBe('{}');
});
it('extracts only canonical displays and records every workspace before moving', async () => {
  await initializeRestoreState(root, state());
  expect(await extractRestoreMedia(root, restoreId, archive())).toEqual(['workshop']);
  const paths = restoreStagingPaths(root, restoreId);
  expect(await readFile(join(paths.media, mediaFileName('workshop', asset)), 'utf8')).toBe(
    'picture',
  );
  expect((await stat(join(paths.media, mediaFileName('workshop', asset)))).mode & 0o777).toBe(
    0o600,
  );
  expect((await readRestoreState(root))!.workspaces).toEqual(['workshop']);
  await moveRestoreMedia(root, restoreId);
  await moveRestoreMedia(root, restoreId);
  expect(await readFile(join(root, mediaFileName('workshop', asset)), 'utf8')).toBe('picture');
});
it('refuses unsafe extraction members and symlink staging without outside writes', async () => {
  await initializeRestoreState(root, state());
  await expect(
    extractRestoreMedia(
      root,
      restoreId,
      tarArchive([{ name: 'workshop/not-a-display.txt', size: 7, content: bytes() }]),
    ),
  ).rejects.toThrow();
  const paths = restoreStagingPaths(root, restoreId);
  await mkdir(join(temp, 'outside'));
  await symlink(join(temp, 'outside'), join(paths.media, 'workshop'));
  await expect(extractRestoreMedia(root, restoreId, archive())).rejects.toThrow();
  expect(await readdir(join(temp, 'outside'))).toEqual([]);
  await expect(extractRestoreMedia(root, otherId, archive())).rejects.toThrow();
});
it('resumes partial moves but refuses both-present and neither-present workspaces', async () => {
  await initializeRestoreState(root, state());
  await extractRestoreMedia(root, restoreId, archive());
  const paths = restoreStagingPaths(root, restoreId);
  await mkdir(join(root, 'workshop'));
  await expect(moveRestoreMedia(root, restoreId)).rejects.toThrow(/workshop/);
  await rm(join(root, 'workshop'), { recursive: true });
  await rename(join(paths.media, 'workshop'), join(temp, 'saved'));
  await expect(moveRestoreMedia(root, restoreId)).rejects.toThrow(/workshop/);
  await rename(join(temp, 'saved'), join(root, 'workshop'));
  await moveRestoreMedia(root, restoreId);
});
it('discard removes only listed owned workspaces and matching state', async () => {
  await initializeRestoreState(root, state());
  await extractRestoreMedia(root, restoreId, archive());
  await moveRestoreMedia(root, restoreId);
  await mkdir(join(root, 'unrelated'));
  await writeFile(join(root, 'unrelated', 'keep'), 'untouched');
  await expect(cleanupRestoreFiles(root, otherId, { removeMoved: true })).rejects.toThrow();
  await cleanupRestoreFiles(root, restoreId, { removeMoved: true, removeState: false });
  expect(await readFile(join(root, 'unrelated', 'keep'), 'utf8')).toBe('untouched');
  expect(await readRestoreState(root)).not.toBeNull();
  await cleanupRestoreFiles(root, restoreId, { removeMoved: true });
  expect(await readRestoreState(root)).toBeNull();
  expect(await readdir(root)).toEqual(['unrelated']);
});
it('active cleanup preserves final media and refuses corrupt workspace metadata', async () => {
  await initializeRestoreState(root, state());
  await extractRestoreMedia(root, restoreId, archive());
  await moveRestoreMedia(root, restoreId);
  const paths = restoreStagingPaths(root, restoreId);
  const invalid = { ...(await readRestoreState(root))!, workspaces: ['../outside'] };
  await writeFile(paths.state, JSON.stringify(invalid));
  await expect(cleanupRestoreFiles(root, restoreId, { removeMoved: true })).rejects.toThrow();
  await writeFile(
    paths.state,
    JSON.stringify({ ...state(), checkpoint: 'active', workspaces: ['workshop'] }),
  );
  await cleanupRestoreFiles(root, restoreId);
  expect(await readFile(join(root, mediaFileName('workshop', asset)), 'utf8')).toBe('picture');
});
it('refuses moving a workspace containing an injected symlink', async () => {
  await initializeRestoreState(root, state());
  await extractRestoreMedia(root, restoreId, archive());
  const paths = restoreStagingPaths(root, restoreId);
  await writeFile(join(temp, 'outside'), 'untouched');
  await symlink(join(temp, 'outside'), join(paths.media, 'workshop', 'injected'));
  await expect(moveRestoreMedia(root, restoreId)).rejects.toThrow();
});
it('discard never deletes a colliding destination created outside the restore', async () => {
  await initializeRestoreState(root, state());
  await extractRestoreMedia(root, restoreId, archive());
  await mkdir(join(root, 'workshop'));
  await writeFile(join(root, 'workshop', 'owner-data'), 'untouched');
  await expect(cleanupRestoreFiles(root, restoreId, { removeMoved: true })).rejects.toThrow();
  expect(await readFile(join(root, 'workshop', 'owner-data'), 'utf8')).toBe('untouched');
});
it('resume and discard refuse a replaced destination after a partial move', async () => {
  await initializeRestoreState(root, state());
  await extractRestoreMedia(root, restoreId, archive());
  await moveRestoreMedia(root, restoreId);
  await rename(join(root, 'workshop'), join(temp, 'original'));
  await mkdir(join(root, 'workshop'));
  await writeFile(join(root, 'workshop', 'owner-data'), 'untouched');
  await expect(moveRestoreMedia(root, restoreId)).rejects.toThrow();
  await expect(cleanupRestoreFiles(root, restoreId, { removeMoved: true })).rejects.toThrow();
  expect(await readFile(join(root, 'workshop', 'owner-data'), 'utf8')).toBe('untouched');
});
it('exclusively claims an empty reserved directory for one initialization', async () => {
  await mkdir(join(root, '.passdown-restore'), { mode: 0o700 });
  const attempts = await Promise.allSettled([
    initializeRestoreState(root, state()),
    initializeRestoreState(root, { ...state(), restoreId: otherId }),
  ]);
  expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const saved = await readRestoreState(root);
  expect((await readdir(join(root, '.passdown-restore'))).sort()).toEqual(
    [saved!.restoreId, 'state.json'].sort(),
  );
});
it('cleans a durable initialization claim belonging to the same restore after a crash', async () => {
  await initializeRestoreState(root, state());
  const paths = restoreStagingPaths(root, restoreId);
  await writeFile(join(paths.control, 'initialize.lock'), restoreId, { mode: 0o600 });
  await cleanupRestoreFiles(root, restoreId);
  expect(await readdir(root)).toEqual([]);
});

it('removes only its own partial run when the initial state rename fails', async () => {
  vi.mocked(rename).mockImplementationOnce(async () => {
    await writeFile(join(root, 'owner-data'), 'untouched');
    throw new Error('Injected initial state rename failure');
  });
  await expect(initializeRestoreState(root, state())).rejects.toThrow(
    'Injected initial state rename failure',
  );
  expect(await readdir(join(root, '.passdown-restore'))).toEqual([]);
  expect(await readFile(join(root, 'owner-data'), 'utf8')).toBe('untouched');
  await rm(join(root, 'owner-data'));
  await expect(preflightRestoreRoot(root)).resolves.toBeUndefined();
});
