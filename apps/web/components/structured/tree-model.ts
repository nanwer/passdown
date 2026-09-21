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
    includeArchived?: boolean;
    visibility?: Category['visibility'];
  },
): CatalogItem[] {
  const query = options.search?.trim().toLocaleLowerCase() ?? '';
  return items.filter(
    (item) =>
      (options.includeArchived || !item.archived) &&
      (!options.visibility || options.visibility === 'members' || item.visibility === 'public') &&
      [item.name, item.specification, item.manufacturer, item.model, item.partNumber]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query),
  );
}
