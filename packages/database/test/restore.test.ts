import { beforeEach, expect, it, vi } from 'vitest';
import { openRestoreSession } from '../src/restore';
const mock = vi.hoisted(() => ({
  query: vi.fn(),
  end: vi.fn(),
  ensure: vi.fn(),
  runtime: vi.fn(),
  comment: null as string | null,
  saved: null as string | null,
  busy: false,
  contents: [] as unknown[],
  invitationCount: 2,
  connect: vi.fn(),
}));
vi.mock('../src/runtime-role', () => ({ ensureRuntimeRole: mock.ensure }));
vi.mock('pg', () => ({
  default: {
    escapeLiteral: (s: string) => `'${s.replaceAll("'", "''")}'`,
    Client: class {
      runtime: boolean;
      constructor(config: { user: string }) {
        this.runtime = config.user === 'guide_runtime';
      }
      connect = mock.connect;
      end = mock.end;
      on() {}
      query = (sql: string, values?: unknown[]) =>
        this.runtime ? mock.runtime(sql, values) : mock.query(sql, values);
    },
  },
}));
const id = '11111111-1111-4111-8111-111111111111';
const backup = 'a'.repeat(64);
const options = {
  ownerURL: 'postgres://owner:test-only@127.0.0.1/restore_test',
  runtimeURL: 'postgres://guide_runtime:test-only@127.0.0.1/restore_test',
};
const prior = { public: true, runtime: false, runtimeGrantOption: false };
const comment = (state: string) => `passdown-restore ${id} ${backup} ${state}`;
beforeEach(() => {
  vi.clearAllMocks();
  mock.comment = null;
  mock.saved = null;
  mock.busy = false;
  mock.contents = [];
  mock.invitationCount = 2;
  mock.runtime.mockResolvedValue({ rows: [{ name: '001.sql', checksum: backup }] });
  mock.query.mockImplementation(async (sql: string) => {
    if (sql === 'BEGIN' || sql.startsWith('BEGIN ISOLATION')) mock.saved = mock.comment;
    if (sql === 'ROLLBACK') mock.comment = mock.saved;
    if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: !mock.busy }] };
    if (sql.includes('shobj_description')) return { rows: [{ comment: mock.comment }] };
    if (sql.startsWith('COMMENT ON DATABASE')) {
      mock.comment = sql.endsWith(' IS NULL') ? null : sql.match(/ IS '(.*)'$/)![1];
      return { rows: [] };
    }
    if (sql.includes('aclexplode'))
      return { rows: [{ grantee: 'PUBLIC', grantable: false, owner_grant: true }] };
    if (sql.includes('AS object_kind')) return { rows: mock.contents };
    if (sql.includes("to_regclass('app.password_reset')"))
      return { rows: [{ invitation: true, resets: false, audit: false, administrators: false }] };
    if (sql.startsWith('DELETE FROM app.invitation'))
      return { rows: [], rowCount: mock.invitationCount };
    if (sql.startsWith('DELETE FROM public.auth')) return { rows: [], rowCount: 0 };
    if (sql.includes('AS accounts')) return { rows: [{ accounts: '3', must_change: '1' }] };
    if (sql.includes('AS workspace_id'))
      return {
        rows: [
          {
            workspace_id: 'workshop',
            workspace_name: 'Workshop',
            email: 'owner@example.test',
            role: 'manage',
          },
        ],
      };
    return { rows: [], rowCount: 0 };
  });
});
it('refuses a held migration lock and closes the owner connection', async () => {
  mock.busy = true;
  await expect(openRestoreSession(options)).rejects.toMatchObject({ problem: 'migration-running' });
  expect(mock.end).toHaveBeenCalledOnce();
});
it('preflight records direct CONNECT grants without changing the empty database', async () => {
  const s = await openRestoreSession(options);
  expect(await s.preflight()).toEqual(prior);
  expect(mock.query.mock.calls.some(([q]) => /REVOKE|COMMENT ON/.test(q))).toBe(false);
  await s.release();
});
it('refuses an existing installation before altering CONNECT or writing a checkpoint', async () => {
  mock.contents = [{ object_kind: 'table', identity: 'app.guide' }];
  const s = await openRestoreSession(options);
  await expect(s.preflight()).rejects.toMatchObject({ problem: 'target-not-empty' });
  expect(mock.query.mock.calls.some(([q]) => /REVOKE|COMMENT ON/.test(q))).toBe(false);
  await s.release();
});
it('gates and records receiving together, then terminates runtime sessions after commit', async () => {
  const s = await openRestoreSession(options);
  await s.beginRestore(id, 'pending', prior);
  expect(mock.ensure).toHaveBeenCalledWith(
    expect.objectContaining({ proveLogin: false, setPassword: false }),
  );
  expect(mock.comment).toBe(`passdown-restore ${id} pending receiving`);
  const sql = mock.query.mock.calls.map(([q]) => q);
  expect(sql.some((q) => q.includes('REVOKE CONNECT') && q.includes('PUBLIC'))).toBe(true);
  expect(sql.indexOf('COMMIT')).toBeLessThan(
    sql.findIndex((q) => q.includes('pg_terminate_backend')),
  );
  await s.release();
});
it('rejects shortcut checkpoints and a mismatched restore identity', async () => {
  mock.comment = comment('receiving');
  const s = await openRestoreSession(options);
  await expect(s.checkpoint(id, 'receiving', 'active')).rejects.toMatchObject({
    problem: 'checkpoint',
  });
  await expect(s.setBackupId('22222222-2222-4222-8222-222222222222', backup)).rejects.toMatchObject(
    { problem: 'identity' },
  );
  expect(mock.comment).toBe(comment('receiving'));
  await s.release();
});
it('baseline cleanup cancels invitations, skips absent reset/audit objects and commits access-reset', async () => {
  mock.comment = comment('verified');
  const s = await openRestoreSession(options);
  const report = await s.applyCredentialPolicy(
    id,
    { openResetLinks: null, pendingInvitations: 2 },
    '2026-01-01T00:00:00Z',
  );
  expect(mock.comment).toBe(comment('access-reset'));
  expect(report).toMatchObject({
    accounts: 3,
    mustChangePassword: 1,
    administrators: null,
    audit: 'not supported by this version',
  });
  expect(
    mock.query.mock.calls.some(
      ([q]) =>
        q.startsWith('UPDATE app.password_reset') ||
        q.includes('SELECT app.operator_record_restore'),
    ),
  ).toBe(false);
  await s.release();
});
it('a wrong credential count rolls back cleanup and preserves verified', async () => {
  mock.comment = comment('verified');
  const s = await openRestoreSession(options);
  await expect(
    s.applyCredentialPolicy(
      id,
      { openResetLinks: null, pendingInvitations: 1 },
      '2026-01-01T00:00:00Z',
    ),
  ).rejects.toMatchObject({ problem: 'credential-counts' });
  expect(mock.comment).toBe(comment('verified'));
  expect(mock.query).toHaveBeenCalledWith('ROLLBACK', undefined);
  await s.release();
});
it('activation proves neutral authentication before granting target access and probes the target', async () => {
  mock.comment = comment('media-moved');
  const s = await openRestoreSession(options);
  await s.activate(id);
  expect(mock.ensure).toHaveBeenCalledWith(
    expect.objectContaining({ probeDatabase: 'postgres', setPassword: false }),
  );
  expect(mock.comment).toBe(comment('active'));
  expect(mock.runtime).toHaveBeenCalledWith(
    'SELECT name,checksum FROM public.schema_migration ORDER BY name',
    undefined,
  );
  await s.release();
});
it('failed final runtime probe re-gates access and rolls checkpoint back to media-moved', async () => {
  mock.comment = comment('media-moved');
  mock.runtime.mockRejectedValueOnce(new Error('Denied'));
  const s = await openRestoreSession(options);
  await expect(s.activate(id)).rejects.toThrow();
  expect(mock.comment).toBe(comment('media-moved'));
  expect(
    mock.query.mock.calls.filter(([q]) => q.includes('REVOKE CONNECT')).length,
  ).toBeGreaterThan(0);
  await s.release();
});
for (const state of [null, 'active'])
  it(`discard refuses ${state ?? 'an ordinary installation'} without dropping objects`, async () => {
    mock.comment = state ? comment(state) : null;
    const s = await openRestoreSession(options);
    await expect(s.discard(id, prior)).rejects.toMatchObject({ problem: 'discard-refused' });
    expect(mock.query.mock.calls.some(([q]) => q.startsWith('DROP'))).toBe(false);
    await s.release();
  });
it('discard of an unfinished restore clears only restored schemas and restores prior CONNECT', async () => {
  mock.comment = comment('receiving');
  const s = await openRestoreSession(options);
  await s.discard(id, prior);
  expect(mock.comment).toBe(null);
  expect(mock.query.mock.calls.some(([q]) => q === 'DROP SCHEMA IF EXISTS app CASCADE')).toBe(true);
  expect(
    mock.query.mock.calls.some(([q]) => q.includes('GRANT CONNECT') && q.endsWith('TO PUBLIC')),
  ).toBe(true);
  expect(
    mock.query.mock.calls.some(([q]) => q.includes('GRANT CONNECT') && q.includes('guide_runtime')),
  ).toBe(false);
  await s.release();
});
it('only active restore may clear its authoritative marker', async () => {
  mock.comment = comment('verified');
  const s = await openRestoreSession(options);
  await expect(s.finish(id)).rejects.toMatchObject({ problem: 'checkpoint' });
  mock.comment = comment('active');
  await s.finish(id);
  expect(mock.comment).toBe(null);
  await s.release();
});
for (const [restoreId, backupId] of [
  [`${id}\n`, backup],
  [id, `${backup}\n`],
]) {
  it('rejects identity strings with trailing control characters before changing state', async () => {
    const session = await openRestoreSession(options);
    await expect(session.beginRestore(restoreId!, backupId!, prior)).rejects.toMatchObject({
      problem: 'identity',
    });
    expect(mock.query.mock.calls.some(([sql]) => sql.startsWith('COMMENT ON DATABASE'))).toBe(
      false,
    );
    await session.release();
  });
}
for (const phase of ['verified', 'access-reset', 'media-moved']) {
  it(`allows read-only media inspection after ${phase} without reapplying access cleanup`, async () => {
    mock.comment = comment(phase);
    const session = await openRestoreSession(options);
    await expect(session.inspectRestored(id)).resolves.toMatchObject({
      assets: [],
      references: [],
      dangling: [],
    });
    expect(mock.comment).toBe(comment(phase));
    expect(
      mock.query.mock.calls.some(([sql]) => sql.startsWith('DELETE') || sql.startsWith('UPDATE')),
    ).toBe(false);
    await session.release();
  });
}
