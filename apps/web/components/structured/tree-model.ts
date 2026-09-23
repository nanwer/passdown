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

export type ThingRow = {
  category: Category;
  depth: number;
  /** Shown only because something inside it matches; it does not match itself. */
  context: boolean;
  /** Whether anything is shown beneath it when expanded. */
  hasChildren: boolean;
  expanded: boolean;
};

/**
 * The rows of the things table, in order.
 *
 * A row appears when it matches, or when something inside it does — then it is
 * context, marked as such, and always open along the way to that match. While
 * searching, a matching row with matches inside it starts open too, so a
 * search never hides its results inside a collapsed branch; the viewer can
 * still close one. Outside a search, rows open only when the viewer opens
 * them. Siblings are ordered by the chosen sort, or by the tree's own order;
 * the hierarchy itself is never flattened.
 */
export function thingRows(
  categories: Category[],
  {
    matches,
    expanded,
    compare,
    searching = false,
    collapsed = new Set<string>(),
  }: {
    matches: (category: Category) => boolean;
    expanded: ReadonlySet<string>;
    compare: ((a: Category, b: Category) => number) | null;
    /** Whether the matches come from a search, which opens the way to all of them. */
    searching?: boolean;
    /** Rows the viewer has closed during this search. */
    collapsed?: ReadonlySet<string>;
  },
): ThingRow[] {
  const ids = new Set(categories.map((category) => category.id));
  const matched = new Set(categories.filter(matches).map((category) => category.id));
  const relevant = new Set(matched);
  for (const category of categories)
    if (matched.has(category.id))
      for (const ancestor of category.path.slice(0, -1))
        if (ids.has(ancestor.id)) relevant.add(ancestor.id);
  const children = new Map<string | null, Category[]>();
  for (const category of categories) {
    if (!relevant.has(category.id)) continue;
    const parent = category.parentId && ids.has(category.parentId) ? category.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), category]);
  }
  const order =
    compare ??
    ((a: Category, b: Category) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const rows: ThingRow[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const category of [...(children.get(parent) ?? [])].sort(order)) {
      const context = !matched.has(category.id);
      const hasChildren = (children.get(category.id)?.length ?? 0) > 0;
      const open =
        hasChildren &&
        (context || (searching ? !collapsed.has(category.id) : expanded.has(category.id)));
      rows.push({ category, depth, context, hasChildren, expanded: open });
      if (open) visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}
