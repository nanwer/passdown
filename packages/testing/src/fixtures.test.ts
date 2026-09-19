import { expect, it } from 'vitest';
import { guideDocumentSchema } from '@guide/content';
import { createDemoQueries } from './index';
it('validates every visible public and synthetic team document against the shared schema', () => {
  const queries = createDemoQueries();
  const publicScope = queries.inWorkspace({ kind: 'anonymous' }, 'repair-collective')!;
  const teamScope = queries.inWorkspace(
    { kind: 'user', id: 'demo-reader', active: true },
    'workshop',
  )!;
  expect(publicScope.list()).toHaveLength(6);
  expect(teamScope.list()).toHaveLength(2);
  for (const guide of [...publicScope.list(), ...teamScope.list()])
    expect(guideDocumentSchema.safeParse(guide.document).success).toBe(true);
  expect(publicScope.get('private-note')).toBeNull();
  expect(queries.inWorkspace({ kind: 'anonymous' }, 'workshop')).toBeNull();
});
