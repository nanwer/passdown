import { describe, expect, it } from 'vitest';
import type { Category, CatalogItem } from '@guide/contracts';
import { eligibleCategories, filterCatalog, searchCategories } from './tree-model';
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
