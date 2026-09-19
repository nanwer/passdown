import { describe, expect, it } from 'vitest';
import type { Category, CatalogItem } from '@guide/contracts';
import {
  eligibleCategories,
  filterCatalog,
  searchCategories,
  catalogCreationDefaults,
} from './tree-model';
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
  it('combines exact item specifications with descendant category filters', () => {
    const item: CatalogItem = {
      id: 'screwdriver',
      workspaceId: 'public',
      categoryId: 'leaf',
      kind: 'tool',
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
      categoryPath: grandchild.path,
    };
    expect(
      filterCatalog([item, { ...item, id: 'other', specification: '#2' }], {
        categoryId: 'root',
        search: '#00',
      }).map((item) => item.id),
    ).toEqual(['screwdriver']);
    expect(filterCatalog([item], { categoryId: 'other' })).toEqual([]);
  });
});
it('keeps explicit parts while deriving material defaults and excludes guide categories', () => {
  const material = { ...root, id: 'material', domain: 'material' as const };
  expect(catalogCreationDefaults([material], 'material', 'all')).toEqual({
    initialKind: 'material',
    initialCategoryId: 'material',
  });
  expect(catalogCreationDefaults([material], 'material', 'part')).toEqual({
    initialKind: 'part',
    initialCategoryId: 'material',
  });
  expect(catalogCreationDefaults([root], 'root', 'all')).toEqual({
    initialKind: 'tool',
    initialCategoryId: null,
  });
});
