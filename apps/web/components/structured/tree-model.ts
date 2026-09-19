import type { Category, CatalogItem } from '@guide/contracts';
export function categoryPath(category: Pick<Category, 'path' | 'name'>): string {
  return category.path.map((node) => node.name).join(' / ') || category.name;
}
export function eligibleCategories(
  categories: Category[],
  options: {
    domain?: Category['domain'];
    visibility?: Category['visibility'];
    excludeIds?: string[];
  } = {},
): Category[] {
  return categories.filter(
    (category) =>
      !category.archived &&
      (!options.domain || category.domain === options.domain) &&
      (!options.visibility ||
        options.visibility === 'members' ||
        category.visibility === 'public') &&
      !category.path.some((node) => options.excludeIds?.includes(node.id)) &&
      !options.excludeIds?.includes(category.id),
  );
}
export function searchCategories(categories: Category[], search: string): Category[] {
  const query = search.trim().toLocaleLowerCase();
  return categories
    .filter((category) => categoryPath(category).toLocaleLowerCase().includes(query))
    .sort((a, b) => a.sortOrder - b.sortOrder || categoryPath(a).localeCompare(categoryPath(b)));
}
export function filterCatalog(
  items: CatalogItem[],
  options: {
    search?: string;
    categoryId?: string | null;
    kind?: CatalogItem['kind'];
    includeArchived?: boolean;
    visibility?: Category['visibility'];
  },
): CatalogItem[] {
  const query = options.search?.trim().toLocaleLowerCase() ?? '';
  return items.filter(
    (item) =>
      (options.includeArchived || !item.archived) &&
      (!options.kind || item.kind === options.kind) &&
      (!options.visibility || options.visibility === 'members' || item.visibility === 'public') &&
      (!options.categoryId || item.categoryPath.some((node) => node.id === options.categoryId)) &&
      [
        item.name,
        item.specification,
        item.manufacturer,
        item.model,
        item.partNumber,
        ...item.categoryPath.map((node) => node.name),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
  );
}
export function catalogCreationDefaults(
  categories: Category[],
  categoryId: string | null,
  kind: CatalogItem['kind'] | 'all',
): { initialKind: CatalogItem['kind']; initialCategoryId: string | null } {
  const category = categories.find(
    (category) => category.id === categoryId && !category.archived && category.domain !== 'guide',
  );
  const initialKind =
    kind === 'all' ? (category?.domain === 'material' ? 'material' : 'tool') : kind;
  return {
    initialKind,
    initialCategoryId:
      category?.domain === (initialKind === 'tool' ? 'tool' : 'material') ? category.id : null,
  };
}
