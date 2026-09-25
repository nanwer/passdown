import { randomUUID } from 'node:crypto';
import { constants, type Stats } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rm, rmdir, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { mediaFileName, parseDisplayMediaFileName } from '@guide/contracts';
import type { ConnectAccess, RestoreCheckpoint } from '@guide/database';
import { validateManifest, type BackupManifest } from './manifest';
import { readTar } from './ustar';

export type RestoreFileState = {
  version: 1;
  restoreId: string;
  backupId: string;
  checkpoint: RestoreCheckpoint;
  manifest: BackupManifest | null;
  previousAccess: ConnectAccess;
  workspaces: string[];
  workspaceIdentities?: Record<string, { dev: number; ino: number }>;
  verificationReport?: unknown;
  accessReport?: unknown;
};
export class RestoreStagingError extends Error {
  constructor(
    message = 'Restore staging is invalid or unsafe. Nothing outside this restore was removed.',
  ) {
    super(message);
    this.name = 'RestoreStagingError';
  }
}
const reserved = '.passdown-restore';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const checkpoints = [
  'receiving',
  'loaded',
  'verification-failed',
  'verified',
  'access-reset',
  'media-moved',
  'active',
];
const maxStateBytes = 32 * 1024 * 1024;
const fail = (message?: string): never => {
  throw new RestoreStagingError(message);
};
const match = (pattern: RegExp, value: unknown): value is string =>
  typeof value === 'string' && pattern.exec(value)?.[0] === value;
const code = (error: unknown) => (error as NodeJS.ErrnoException | null)?.code;
const same = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino;
function validWorkspace(name: string) {
  try {
    mediaFileName(name, '00000000-0000-0000-0000-000000000000');
  } catch {
    fail();
  }
}
export function restoreStagingPaths(root: string, restoreId: string) {
  if (!match(uuid, restoreId)) fail();
  const control = join(root, reserved),
    run = join(control, restoreId);
  return { control, state: join(control, 'state.json'), run, media: join(run, 'media') };
}
function validateState(value: unknown): RestoreFileState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const s = value as RestoreFileState;
  const keys = Object.keys(s);
  const required = [
    'version',
    'restoreId',
    'backupId',
    'checkpoint',
    'manifest',
    'previousAccess',
    'workspaces',
  ];
  if (
    required.some((key) => !keys.includes(key)) ||
    keys.some(
      (key) =>
        ![...required, 'workspaceIdentities', 'verificationReport', 'accessReport'].includes(key),
    ) ||
    s.version !== 1 ||
    !match(uuid, s.restoreId) ||
    !checkpoints.includes(s.checkpoint)
  )
    return fail();
  if (s.manifest === null) {
    if (s.checkpoint !== 'receiving' || s.backupId !== 'pending') return fail();
  } else {
    if (!match(hash, s.backupId)) return fail();
    try {
      validateManifest(s.manifest);
    } catch {
      return fail();
    }
  }
  const a = s.previousAccess;
  if (
    !a ||
    typeof a !== 'object' ||
    Object.keys(a).sort().join(',') !== 'public,runtime,runtimeGrantOption' ||
    [a.public, a.runtime, a.runtimeGrantOption].some((v) => typeof v !== 'boolean') ||
    (a.runtimeGrantOption && !a.runtime)
  )
    return fail();
  if (
    !Array.isArray(s.workspaces) ||
    s.workspaces.some((w) => typeof w !== 'string') ||
    new Set(s.workspaces).size !== s.workspaces.length
  )
    return fail();
  for (const workspace of s.workspaces) validWorkspace(workspace);
  if (s.workspaceIdentities !== undefined) {
    if (
      !s.workspaceIdentities ||
      typeof s.workspaceIdentities !== 'object' ||
      Array.isArray(s.workspaceIdentities)
    )
      return fail();
    for (const [workspace, identity] of Object.entries(s.workspaceIdentities)) {
      if (
        !s.workspaces.includes(workspace) ||
        !identity ||
        typeof identity !== 'object' ||
        Object.keys(identity).sort().join(',') !== 'dev,ino' ||
        !Number.isSafeInteger(identity.dev) ||
        identity.dev < 0 ||
        !Number.isSafeInteger(identity.ino) ||
        identity.ino < 0
      )
        return fail();
    }
  }
  return s;
}
async function inspect(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (code(error) === 'ENOENT') return null;
    return fail();
  }
}
async function directory(path: string): Promise<Stats> {
  const s = await inspect(path);
  if (!s || !s.isDirectory() || s.isSymbolicLink()) return fail();
  return s;
}
async function syncDirectory(path: string) {
  const before = await directory(path);
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    if (!same(before, await handle.stat())) fail();
    await handle.sync();
  } finally {
    await handle.close();
  }
}
async function checkedPaths(root: string, restoreId: string, requireRun = true) {
  await directory(root);
  const paths = restoreStagingPaths(root, restoreId);
  await directory(paths.control);
  if (requireRun) {
    await directory(paths.run);
    await directory(paths.media);
  }
  return paths;
}
async function openState(root: string): Promise<{ handle: FileHandle; before: Stats } | null> {
  await directory(root);
  const control = join(root, reserved);
  const controlStat = await inspect(control);
  if (!controlStat) return null;
  if (!controlStat.isDirectory() || controlStat.isSymbolicLink()) return fail();
  const path = join(control, 'state.json'),
    before = await inspect(path);
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink() || before.size > maxStateBytes) return fail();
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const after = await handle.stat();
    if (
      !after.isFile() ||
      !same(before, after) ||
      after.size !== before.size ||
      !same(controlStat, await directory(control))
    )
      fail();
    return { handle, before };
  } catch (error) {
    await handle.close();
    throw error;
  }
}
export async function readRestoreState(root: string): Promise<RestoreFileState | null> {
  let opened: Awaited<ReturnType<typeof openState>>;
  try {
    opened = await openState(root);
  } catch {
    return fail();
  }
  if (!opened) return null;
  try {
    const data = await opened.handle.readFile();
    const after = await opened.handle.stat();
    if (
      data.length > maxStateBytes ||
      after.size !== opened.before.size ||
      after.mtimeMs !== opened.before.mtimeMs
    )
      return fail();
    return validateState(JSON.parse(data.toString('utf8')));
  } catch {
    return fail();
  } finally {
    await opened.handle.close();
  }
}
async function matching(root: string, restoreId: string) {
  if (!match(uuid, restoreId)) return fail();
  const state = await readRestoreState(root);
  if (!state || state.restoreId !== restoreId)
    return fail('Restore identity does not match the saved filesystem state.');
  return state;
}
/** New restores never reuse an occupied root or an unfinished restore record. */
export async function preflightRestoreRoot(root: string): Promise<void> {
  await directory(root);
  for (const name of await readdir(root)) {
    if (name !== reserved) fail('The media root must be empty before a new restore.');
    const control = join(root, name);
    await directory(control);
    if ((await readdir(control)).length)
      fail('An unfinished restore already exists; activate or discard it first.');
  }
}
async function persist(root: string, state: RestoreFileState, initial = false) {
  validateState(state);
  const paths = await checkedPaths(root, state.restoreId);
  const serialized = Buffer.from(JSON.stringify(state));
  if (serialized.length > maxStateBytes) fail();
  const temporary = join(paths.control, `state-${randomUUID()}.tmp`);
  let handle: FileHandle | undefined;
  try {
    handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    await handle.writeFile(serialized);
    await handle.sync();
    await handle.close();
    handle = undefined;
    if (initial) {
      if (await inspect(paths.state)) fail();
    } else await matching(root, state.restoreId);
    await rename(temporary, paths.state);
    await syncDirectory(paths.control);
  } finally {
    await handle?.close();
    await rm(temporary, { force: true });
  }
}
export async function initializeRestoreState(root: string, state: RestoreFileState): Promise<void> {
  validateState(state);
  await preflightRestoreRoot(root);
  const paths = restoreStagingPaths(root, state.restoreId);
  if (!(await inspect(paths.control))) {
    await mkdir(paths.control, { mode: 0o700 });
    await syncDirectory(root);
  }
  // The durable claim serializes callers that passed preflight concurrently.
  const claimPath = join(paths.control, 'initialize.lock');
  const claim = await open(
    claimPath,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  let runOwned: Stats | undefined;
  let mediaOwned: Stats | undefined;
  let retainClaim = false;
  try {
    await claim.writeFile(state.restoreId);
    await claim.sync();
    await syncDirectory(paths.control);
    if ((await readdir(paths.control)).some((name) => name !== 'initialize.lock')) fail();
    await mkdir(paths.run, { mode: 0o700 });
    runOwned = await directory(paths.run);
    await mkdir(paths.media, { mode: 0o700 });
    mediaOwned = await directory(paths.media);
    await syncDirectory(paths.run);
    await syncDirectory(paths.control);
    await persist(root, state, true);
  } catch (error) {
    try {
      // A published state is recoverable. Before publication, remove only the
      // empty directories created by this invocation, never an injected entry.
      if (!(await inspect(paths.state))) {
        for (const [path, owned] of [
          [paths.media, mediaOwned],
          [paths.run, runOwned],
        ] as const) {
          if (!owned) continue;
          const present = await inspect(path);
          if (!present) continue;
          if (!present.isDirectory() || present.isSymbolicLink() || !same(owned, present)) fail();
          await rmdir(path);
        }
        await syncDirectory(paths.control);
      }
    } catch {
      // Keep the durable identity claim if cleanup cannot be proven safe.
      retainClaim = true;
    }
    throw error;
  } finally {
    await claim.close();
    if (!retainClaim) {
      await rm(claimPath);
      await syncDirectory(paths.control);
    }
  }
}
export async function writeRestoreState(root: string, state: RestoreFileState): Promise<void> {
  validateState(state);
  await matching(root, state.restoreId);
  await persist(root, state);
}
/** Extract only a previously verified media archive; each workspace is journaled before its first file. */
export async function extractRestoreMedia(
  root: string,
  restoreId: string,
  source: AsyncIterable<Uint8Array>,
  options: { signal?: AbortSignal } = {},
): Promise<string[]> {
  let state = await matching(root, restoreId);
  const paths = await checkedPaths(root, restoreId);
  if (state.checkpoint !== 'receiving') fail();
  for await (const entry of readTar(source)) {
    options.signal?.throwIfAborted();
    const identity = parseDisplayMediaFileName(entry.name);
    if (!identity) return fail('Restore archive contains an invalid picture path.');
    const workspacePath = join(paths.media, identity.workspace);
    if (!state.workspaces.includes(identity.workspace)) {
      if (await inspect(workspacePath)) fail();
      state = { ...state, workspaces: [...state.workspaces, identity.workspace].sort() };
      await writeRestoreState(root, state);
      await mkdir(workspacePath, { mode: 0o700 });
      await syncDirectory(paths.media);
      const owned = await directory(workspacePath);
      state = {
        ...state,
        workspaceIdentities: {
          ...state.workspaceIdentities,
          [identity.workspace]: { dev: owned.dev, ino: owned.ino },
        },
      };
      await writeRestoreState(root, state);
    }
    await checkedPaths(root, restoreId);
    const workspaceStat = await directory(workspacePath);
    const owned = state.workspaceIdentities?.[identity.workspace];
    if (!owned || owned.dev !== workspaceStat.dev || owned.ino !== workspaceStat.ino) fail();
    const file = await open(
      join(paths.media, entry.name),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      for await (const chunk of entry.content) {
        options.signal?.throwIfAborted();
        await file.writeFile(chunk);
      }
      await file.sync();
    } finally {
      await file.close();
    }
    await syncDirectory(workspacePath);
  }
  options.signal?.throwIfAborted();
  return state.workspaces;
}
/** Each rename is atomic; a prior successful move is accepted on resume. */
export async function moveRestoreMedia(root: string, restoreId: string): Promise<void> {
  const state = await matching(root, restoreId),
    paths = await checkedPaths(root, restoreId);
  for (const workspace of state.workspaces) {
    const from = join(paths.media, workspace),
      to = join(root, workspace),
      source = await inspect(from),
      target = await inspect(to);
    if (Boolean(source) === Boolean(target))
      fail(`Restore workspace ${workspace} must exist in exactly one location.`);
    const present = source ?? target!;
    if (!present.isDirectory() || present.isSymbolicLink())
      fail(`Restore workspace ${workspace} is not a safe directory.`);
    const owned = state.workspaceIdentities?.[workspace];
    if (!owned || owned.dev !== present.dev || owned.ino !== present.ino)
      fail(`Restore workspace ${workspace} no longer matches its recorded identity.`);
    await safeTree(source ? from : to);
    if (source) {
      await rename(from, to);
      await syncDirectory(paths.media);
      await syncDirectory(root);
    }
  }
}
async function safeTree(path: string): Promise<void> {
  const s = await inspect(path);
  if (!s) return;
  if (s.isSymbolicLink() || (!s.isDirectory() && !s.isFile())) fail();
  if (s.isDirectory()) for (const entry of await readdir(path)) await safeTree(join(path, entry));
}
/** Caller must first confirm this restore ID against the authoritative database comment. */
export async function cleanupRestoreFiles(
  root: string,
  restoreId: string,
  options: { removeMoved?: boolean; removeState?: boolean } = {},
): Promise<void> {
  const state = await matching(root, restoreId),
    paths = await checkedPaths(root, restoreId, false);
  if (options.removeMoved && state.checkpoint === 'active')
    fail('An active restore cannot be discarded.');
  if (options.removeMoved) {
    for (const workspace of state.workspaces) {
      const source = await inspect(join(paths.media, workspace)),
        target = await inspect(join(root, workspace));
      if (!target) continue;
      const owned = state.workspaceIdentities?.[workspace];
      if (
        source ||
        !target.isDirectory() ||
        target.isSymbolicLink() ||
        !owned ||
        owned.dev !== target.dev ||
        owned.ino !== target.ino
      )
        fail(
          `Restore workspace ${workspace} cannot be safely discarded because its identity changed.`,
        );
    }
  }
  const targets = [
    paths.run,
    ...(options.removeMoved ? state.workspaces.map((w) => join(root, w)) : []),
  ];
  const claimPath = join(paths.control, 'initialize.lock');
  const claimStat = await inspect(claimPath);
  if (claimStat) {
    if (!claimStat.isFile() || claimStat.isSymbolicLink() || claimStat.size !== restoreId.length)
      fail();
    const claim = await open(
      claimPath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      if (!same(claimStat, await claim.stat()) || (await claim.readFile('utf8')) !== restoreId)
        fail();
    } finally {
      await claim.close();
    }
  }
  // Validate the entire deletion set before changing anything.
  for (const path of targets) await safeTree(path);
  for (const path of targets) await rm(path, { recursive: true, force: true });
  await syncDirectory(root);
  await syncDirectory(paths.control);
  if (options.removeState !== false) {
    await matching(root, restoreId);
    if (claimStat) await rm(claimPath);
    await rm(paths.state);
    await syncDirectory(paths.control);
    if ((await readdir(paths.control)).length === 0) {
      await rmdir(paths.control);
      await syncDirectory(root);
    }
  }
}
