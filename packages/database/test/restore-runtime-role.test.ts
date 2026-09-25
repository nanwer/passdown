import { expect, it, vi } from 'vitest';
import { ensureRuntimeRole } from '../src/runtime-role';
const mock = vi.hoisted(() => ({ clients: vi.fn(), queries: vi.fn() }));
vi.mock('pg', () => ({
  default: {
    escapeLiteral: (s: string) => `'${s}'`,
    Client: class {
      constructor(config: unknown) {
        mock.clients(config);
      }
      async connect() {}
      async end() {}
      async query(sql: string | { text: string }) {
        mock.queries(sql);
        const text = typeof sql === 'string' ? sql : sql.text;
        if (text.startsWith('SELECT * FROM pg_roles'))
          return {
            rowCount: 1,
            rows: [
              {
                rolcanlogin: true,
                rolsuper: false,
                rolcreatedb: false,
                rolcreaterole: false,
                rolinherit: false,
                rolreplication: false,
                rolbypassrls: false,
              },
            ],
          };
        if (text.includes('AS owned')) return { rows: [{ owned: false }] };
        if (text.includes('AS safe')) return { rows: [{ safe: true }] };
        if (text === 'SELECT current_user') return { rows: [{ current_user: 'guide_runtime' }] };
        return { rowCount: 0, rows: [] };
      }
    },
  },
}));
it('validates an existing runtime role without opening a closed restore target or changing its password', async () => {
  await ensureRuntimeRole({
    ownerURL: 'postgres://owner:private@localhost/restore',
    runtimeURL: 'postgres://guide_runtime:private@localhost/restore',
    proveLogin: false,
  });
  expect(mock.clients).toHaveBeenCalledTimes(1);
  expect(
    mock.queries.mock.calls.some(
      ([query]) => typeof query === 'string' && query.startsWith('ALTER ROLE'),
    ),
  ).toBe(false);
});
