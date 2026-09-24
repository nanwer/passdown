import { beforeEach, expect, it, vi } from 'vitest';
import { openBackupSnapshot, verifyMediaRows } from '../src/lifecycle';
import { migrationLockKey } from '../src/migrator';

const mock = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  config: vi.fn(),
}));
vi.mock('pg', () => ({
  default: {
    Client: class {
      constructor(config: unknown) {
        mock.config(config);
      }
      query = mock.query;
      connect = mock.connect;
      end = mock.end;
      on = mock.on;
    },
  },
}));
const params = {
  host: '127.0.0.1',
  port: 5432,
  database: 'isolated',
  user: 'owner',
  password: 'test-only',
};
const tables = [
  { schema: 'app', name: 'asset' },
  { schema: 'app', name: 'guide' },
  { schema: 'public', name: 'auth_session' },
  { schema: 'public', name: 'auth_verification' },
  { schema: 'app', name: 'rate_limit' },
  { schema: 'public', name: 'schema_migration' },
];
function answer(sql: string) {
  if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }] };
  if (sql.includes('pg_export_snapshot'))
    return {
      rows: [
        {
          id: '0001-0002-1',
          snapshot_at: new Date('2026-01-01T00:00:00Z'),
          database_name: 'isolated',
          server_version: '17.6',
        },
      ],
    };
  if (sql.includes('pg_catalog.pg_class')) return { rows: tables };
  if (sql.startsWith('SELECT name,checksum'))
    return { rows: [{ name: '001_application.sql', checksum: 'a'.repeat(64) }] };
  if (sql.startsWith('SELECT count(*)')) return { rows: [{ count: '2' }] };
  if (sql.includes('content_hash AS'))
    return {
      rows: [{ workspace: 'workshop', asset: 'asset-id', bytes: '14', sha256: 'b'.repeat(64) }],
    };
  return { rows: [] };
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.query.mockImplementation(async (sql: string) => answer(sql));
});

it('exports one read-only snapshot with counts excluding live credentials and holds its lock until release', async () => {
  const snapshot = await openBackupSnapshot(params);
  expect(mock.config).toHaveBeenCalledWith(
    expect.objectContaining({ ...params, ssl: false, options: ' ' }),
  );
  expect(mock.query.mock.calls.slice(0, 3)).toEqual([
    ['SELECT pg_try_advisory_lock($1) AS locked', [migrationLockKey]],
    ['BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'],
    ['SET LOCAL row_security = off'],
  ]);
  expect(snapshot).toMatchObject({
    id: '0001-0002-1',
    snapshotAt: '2026-01-01T00:00:00.000Z',
    databaseName: 'isolated',
    serverVersion: '17.6',
    migrations: [{ name: '001_application.sql', checksum: 'a'.repeat(64) }],
    counts: {
      'app.asset': 2,
      'app.guide': 2,
      'public.schema_migration': 2,
      'public.auth_session': null,
      'public.auth_verification': null,
      'app.rate_limit': null,
    },
    credentials: { openResetLinks: null, pendingInvitations: 0 },
    assets: [{ workspace: 'workshop', asset: 'asset-id', bytes: 14, sha256: 'b'.repeat(64) }],
    dangling: [],
  });
  expect(
    mock.query.mock.calls.filter(([sql]) => /^SELECT count/.test(sql)).map(([sql]) => sql),
  ).not.toEqual(
    expect.arrayContaining([
      expect.stringContaining('auth_session'),
      expect.stringContaining('auth_verification'),
      expect.stringContaining('rate_limit'),
    ]),
  );
  expect(mock.end).not.toHaveBeenCalled();
  await Promise.all([snapshot.release(), snapshot.release()]);
  expect(mock.query.mock.calls.slice(-2)).toEqual([
    ['ROLLBACK'],
    ['SELECT pg_advisory_unlock($1)', [migrationLockKey]],
  ]);
  expect(mock.end).toHaveBeenCalledTimes(1);
});
it('refuses a busy migration lock without opening a transaction or unlocking another session', async () => {
  mock.query.mockResolvedValue({ rows: [{ locked: false }] });
  await expect(openBackupSnapshot(params)).rejects.toMatchObject({ problem: 'migration-running' });
  expect(mock.query.mock.calls).toEqual([
    ['SELECT pg_try_advisory_lock($1) AS locked', [migrationLockKey]],
  ]);
  expect(mock.end).toHaveBeenCalledOnce();
});
it('closes its client when connecting fails', async () => {
  mock.connect.mockRejectedValueOnce(new Error('Unavailable'));
  await expect(openBackupSnapshot(params)).rejects.toThrow('Unavailable');
  expect(mock.query).not.toHaveBeenCalled();
  expect(mock.end).toHaveBeenCalledOnce();
});
it('cleans up a failed inventory without masking the original failure', async () => {
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.includes('pg_catalog.pg_class')) throw new Error('Inventory failed');
    return answer(sql);
  });
  await expect(openBackupSnapshot(params)).rejects.toThrow('Inventory failed');
  expect(mock.query.mock.calls.slice(-2)).toEqual([
    ['ROLLBACK'],
    ['SELECT pg_advisory_unlock($1)', [migrationLockKey]],
  ]);
  expect(mock.end).toHaveBeenCalledOnce();
});
for (const failure of ['ROLLBACK', 'SELECT pg_advisory_unlock($1)']) {
  it(`still closes the connection when ${failure} fails`, async () => {
    const snapshot = await openBackupSnapshot(params);
    mock.query.mockImplementation(async (sql: string) => {
      if (sql === failure) throw new Error('Cleanup failed');
      return answer(sql);
    });
    await expect(snapshot.release()).rejects.toThrow();
    expect(mock.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [migrationLockKey]);
    expect(mock.end).toHaveBeenCalledOnce();
  });
}
it('verification returns inventory and releases its read-only connection automatically', async () => {
  const result = await verifyMediaRows(params);
  expect(result).toMatchObject({
    assets: [{ workspace: 'workshop', asset: 'asset-id', bytes: 14 }],
    dangling: [],
  });
  expect(mock.end).toHaveBeenCalledOnce();
});
it('counts pending invitations and open resets only when their tables exist', async () => {
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.includes('pg_catalog.pg_class'))
      return {
        rows: [
          ...tables,
          { schema: 'app', name: 'invitation' },
          { schema: 'app', name: 'password_reset' },
        ],
      };
    return answer(sql);
  });
  const snapshot = await openBackupSnapshot(params);
  expect(snapshot.credentials).toEqual({ openResetLinks: 2, pendingInvitations: 2 });
  expect(mock.query).toHaveBeenCalledWith(
    'SELECT count(*)::text AS count FROM app.invitation WHERE accepted_at IS NULL',
  );
  expect(mock.query).toHaveBeenCalledWith(
    'SELECT count(*)::text AS count FROM app.password_reset WHERE used_at IS NULL AND revoked_at IS NULL',
  );
  await snapshot.release();
});
it('refuses an uninitialized database and closes the snapshot', async () => {
  mock.query.mockImplementation(async (sql: string) =>
    sql.includes('pg_catalog.pg_class') ? { rows: [] } : answer(sql),
  );
  await expect(openBackupSnapshot(params)).rejects.toMatchObject({ problem: 'uninitialized' });
  expect(mock.end).toHaveBeenCalledOnce();
});
it('returns valid usages alongside dangling references for file diagnostics', async () => {
  const good = {
    workspace: 'workshop',
    asset: 'present',
    source: 'guide-document',
    sourceId: 'guide-a',
  };
  const missing = {
    workspace: 'workshop',
    asset: 'missing',
    source: 'release-cover',
    sourceId: 'guide-a:1',
  };
  mock.query.mockImplementation(async (sql: string) => {
    if (sql.includes('WITH picture_references'))
      return {
        rows: [
          { ...good, present: true },
          { ...missing, present: false },
        ],
      };
    return answer(sql);
  });
  const result = await verifyMediaRows(params);
  expect(result.references).toEqual([good, missing]);
  expect(result.dangling).toEqual([missing]);
});
