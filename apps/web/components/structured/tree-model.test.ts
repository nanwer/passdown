import { describe, expect, it } from 'vitest';
import type { Category, CatalogItem } from '@guide/contracts';
import { eligibleCategories, filterCatalog, searchCategories, thingRows } from './tree-model';
const root: Category = {
  id: 'root',
  workspaceId: 'public',
  code: 'GC-0001',
  domain: 'guide',
  parentId: null,
  name: 'Electronics',
  description: '',
  visibility: 'public',
  archived: false,
  version: 1,
  sortOrder: 0,
  imageAssetId: null,
  path: [{ id: 'root', name: 'Electronics' }],
};
const child: Category = {
  ...root,
  id: 'child',
  name: 'Laptop',
  parentId: 'root',
  path: [...root.path, { id: 'child', name: 'Laptop' }],
};
const grandchild: Category = {
  ...root,
  id: 'leaf',
  name: 'Model',
  parentId: 'child',
  path: [...child.path, { id: 'leaf', name: 'Model' }],
};
describe('structured selection rules', () => {
  it('excludes self and all descendants from a parent selection without removing unrelated branches', () => {
    expect(
      eligibleCategories([root, child, grandchild], { excludeIds: ['child'] }).map(
        (category) => category.id,
      ),
    ).toEqual(['root']);
  });
  it('searches complete paths and excludes archived/private choices for public guides', () => {
    expect(
      searchCategories([root, child, grandchild], 'laptop').map((category) => category.id),
    ).toEqual(['child', 'leaf']);
    expect(
      eligibleCategories(
        [root, { ...child, visibility: 'members' }, { ...grandchild, archived: true }],
        { visibility: 'public' },
      ),
    ).toEqual([root]);
  });
  it('finds an item by its exact specification, not just its name', () => {
    const item: CatalogItem = {
      id: 'screwdriver',
      workspaceId: 'public',
      name: 'Phillips screwdriver',
      specification: '#00',
      description: '',
      manufacturer: '',
      model: '',
      partNumber: '',
      defaultUnit: 'each',
      visibility: 'public',
      archived: false,
      version: 1,
    };
    // Two screwdrivers of the same name differ only by specification, which is
    // the whole point of an exact catalog.
    expect(
      filterCatalog([item, { ...item, id: 'other', specification: '#2' }], {
        search: '#00',
      }).map((entry) => entry.id),
    ).toEqual(['screwdriver']);
    expect(filterCatalog([item], { search: 'torx' })).toEqual([]);
  });
});

describe('thingRows', () => {
  const node = (id: string, name: string, parent: Category | null, sortOrder = 0): Category => ({
    ...root,
    id,
    name,
    code: id.toUpperCase(),
    parentId: parent?.id ?? null,
    sortOrder,
    path: [...(parent?.path ?? []), { id, name }],
  });
  const bikes = node('bikes', 'Bicycles', null, 1);
  const brakes = node('brakes', 'Brakes', bikes, 2);
  const chains = node('chains', 'Chains', bikes, 1);
  const lamps = node('lamps', 'Lamps', null, 0);
  const all = [bikes, brakes, chains, lamps];
  const names = (rows: ReturnType<typeof thingRows>) =>
    rows.map(
      (row) => `${'  '.repeat(row.depth)}${row.category.name}${row.context ? ' (context)' : ''}`,
    );

  it('shows the top level in tree order until a row is opened', () => {
    const rows = thingRows(all, { matches: () => true, expanded: new Set(), compare: null });
    expect(names(rows)).toEqual(['Lamps', 'Bicycles']);
    expect(rows[1]).toMatchObject({ hasChildren: true, expanded: false });
    expect(
      names(thingRows(all, { matches: () => true, expanded: new Set(['bikes']), compare: null })),
    ).toEqual(['Lamps', 'Bicycles', '  Chains', '  Brakes']);
  });

  it('opens the way to a match and marks what it passes through as context', () => {
    const rows = thingRows(all, {
      matches: (category) => category.name === 'Brakes',
      expanded: new Set(),
      compare: null,
    });
    expect(names(rows)).toEqual(['Bicycles (context)', '  Brakes']);
  });

  it('sorts siblings without flattening the tree', () => {
    // Alphabetical is the opposite of the tree's own order at both levels here,
    // so a result that ignored the sort could not pass.
    const byName = (a: Category, b: Category) => a.name.localeCompare(b.name);
    expect(
      names(thingRows(all, { matches: () => true, expanded: new Set(['bikes']), compare: byName })),
    ).toEqual(['Bicycles', '  Brakes', '  Chains', 'Lamps']);
  });
});

describe('thingRows while searching', () => {
  const node = (id: string, name: string, parent: Category | null): Category => ({
    ...root,
    id,
    name,
    parentId: parent?.id ?? null,
    path: [...(parent?.path ?? []), { id, name }],
  });
  const parent = node('parent', 'Parent', null);
  const child = node('child', 'Child', parent);
  const all = [parent, child];
  const byPath = (category: Category) => category.path.some((part) => part.name === 'Parent');

  it('opens a matching row that has matches inside it', () => {
    // Searching "Parent" matches Parent and Parent / Child by path. Child used
    // to stay hidden until Parent was opened by hand.
    const rows = thingRows(all, {
      matches: byPath,
      expanded: new Set(),
      compare: null,
      searching: true,
    });
    expect(rows.map((row) => row.category.name)).toEqual(['Parent', 'Child']);
    expect(rows[0]).toMatchObject({ context: false, expanded: true });
  });

  it('lets the viewer close one during a search', () => {
    const rows = thingRows(all, {
      matches: byPath,
      expanded: new Set(),
      compare: null,
      searching: true,
      collapsed: new Set(['parent']),
    });
    expect(rows.map((row) => row.category.name)).toEqual(['Parent']);
  });
});
