import { expect, it } from 'vitest';
import type pg from 'pg';
import { managementStore } from '../src/management-store';

it('lists a page of things without just-in-time compiling the query', async () => {
  // The planner overestimates the recursive tree query by several orders of
  // magnitude (a cost of millions for three rows), which is past PostgreSQL's
  // default jit_above_cost. Compiling it then took about 0.75 s on every
  // request for a query that runs in under 20 ms.
  const statements: string[] = [];
  const client = {
    query: async (sql: string) => {
      statements.push(sql.trim());
      return { rows: [{ total: 0, page: 1, status_counts: {}, rows: [] }] };
    },
  } as unknown as pg.PoolClient;
  const store = managementStore(async (_actor, _workspace, run) => run(client));
  await store.listCategoryPage({ kind: 'anonymous' } as never, 'workspace', {
    page: 1,
    pageSize: 25,
    search: '',
    status: 'active',
    visibility: 'all',
    usage: 'all',
  } as never);
  const page = statements.findIndex((sql) => sql.startsWith('WITH RECURSIVE'));
  expect(page).toBeGreaterThan(-1);
  expect(statements.slice(0, page)).toContain('SET LOCAL jit = off');
});
