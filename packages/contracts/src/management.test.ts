import { describe, expect, it } from 'vitest';
import { categoryManagementQuerySchema, catalogManagementQuerySchema } from './management';

const id = '44444444-4444-4444-8444-444444444444';
describe('management query contracts', () => {
  it('sets bounded defaults and accepts the HTTP query representation', () => {
    expect(
      catalogManagementQuerySchema.parse({
        page: '2',
        pageSize: '50',
        search: '  Size 2  ',
        visibility: 'members',
        usage: 'used',
      }),
    ).toEqual({
      page: 2,
      pageSize: 50,
      search: 'Size 2',
      visibility: 'members',
      usage: 'used',
      status: 'active',
      sort: 'name',
      direction: 'ascending',
    });
    expect(
      categoryManagementQuerySchema.parse({ expanded: id, collapsed: '', reveal: id }),
    ).toMatchObject({
      expanded: [id],
      collapsed: [],
      reveal: id,
      sort: 'tree',
      domain: 'guide',
      page: 1,
      pageSize: 25,
    });
  });
  it.each([
    { page: '0' },
    { page: '1.5' },
    { pageSize: '51' },
    { pageSize: '0' },
    { visibility: 'private' },
    { usage: 'sometimes' },
    { sort: 'name; DELETE FROM app.catalog_item' },
    { direction: 'up' },
    { search: 'x'.repeat(201) },
    { reveal: 'not-an-id' },
  ])('rejects invalid paging and filtering: %j', (query) => {
    expect(catalogManagementQuerySchema.safeParse(query).success).toBe(false);
  });
  it('limits expansion state and rejects unrelated domains and catalog-only sort columns', () => {
    expect(categoryManagementQuerySchema.safeParse({ expanded: Array(501).fill(id) }).success).toBe(
      false,
    );
    expect(categoryManagementQuerySchema.safeParse({ collapsed: 'not-an-id' }).success).toBe(false);
    expect(categoryManagementQuerySchema.safeParse({ domain: 'tool' }).success).toBe(false);
    expect(categoryManagementQuerySchema.safeParse({ sort: 'manufacturer' }).success).toBe(false);
  });
});
