import { describe, expect, it } from 'vitest';
import type { Category } from '@guide/contracts';
import { resolveCategoryFilter } from './category-filter';

const category = (id: string, name: string, parentId: string | null = null): Category => ({
  id,
  name,
  parentId,
  code: `GC-${id}`,
  workspaceId: 'repair-collective',
  imageAssetId: null,
  domain: 'guide',
  description: '',
  visibility: 'public',
  sortOrder: 0,
  archived: false,
  version: 1,
  path: [{ id, name }],
});
describe('legacy category bookmarks', () => {
  it('resolves a unique normalized name to the same subtree ID as a current bookmark', () => {
    const root = category('root', 'Home & living');
    const child = category('child', 'Lamps', root.id);
    expect(resolveCategoryFilter([root, child], ' ＨＯＭＥ  & LIVING ')).toBe(root);
    expect(resolveCategoryFilter([root, child], root.id)).toBe(root);
  });
  it('does not guess across duplicate leaf names, unavailable or archived categories', () => {
    const first = category('first', 'Maintenance', 'bicycles');
    const second = category('second', 'Maintenance', 'appliances');
    expect(resolveCategoryFilter([first, second], 'Maintenance')).toBeUndefined();
    expect(resolveCategoryFilter([first, second], second.id)).toBe(second);
    expect(resolveCategoryFilter([first], 'private')).toBeUndefined();
    expect(resolveCategoryFilter([{ ...first, archived: true }], first.name)).toBeUndefined();
  });
});
