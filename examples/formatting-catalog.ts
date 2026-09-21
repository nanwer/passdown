import { toStructuredDocument, type GuideDocument } from '../packages/guide-content/src/index';
import type { Category, CatalogItem } from '../packages/contracts/src/index';

type ExampleApi = (path: string, method?: string, body?: unknown) => Promise<any>;
// Explicit authored classifications for these three examples, never a migration heuristic.
const exampleKinds = {
  'Small parts tray': 'tool',
  'Reusable labels': 'material',
  Pen: 'tool',
} as const;
export async function prepareFormattingExample(document: GuideDocument, api: ExampleApi) {
  const root = '/api/studio/repair-collective';
  const categories: Category[] = (await api(`${root}/categories`)).categories;
  async function category(name: string) {
    let found = categories.find(
      (item) =>
        !item.archived &&
        item.parentId === null &&
        item.name === name &&
        item.visibility === 'public',
    );
    if (!found) {
      found = (
        await api(`${root}/categories`, 'POST', {
          domain: 'guide',
          parentId: null,
          name,
          description: '',
          visibility: 'public',
          sortOrder: 0,
        })
      ).category as Category;
      categories.push(found);
    }
    return found;
  }
  const guideCategory = await category('Formatting examples');
  const items: CatalogItem[] = (await api(`${root}/catalog`)).items;
  const structured = toStructuredDocument(document);
  for (const original of structured.unresolvedTools) {
    const kind = exampleKinds[original.label as keyof typeof exampleKinds];
    if (!kind)
      throw new Error(
        `An example preparation item needs an explicit classification: ${original.label}`,
      );
    let item = items.find(
      (item) =>
        !item.archived &&
        item.name === original.label &&
        item.kind === kind &&
        item.visibility === 'public' &&
        item.specification === '',
    );
    if (!item) {
      item = (
        await api(`${root}/catalog`, 'POST', {
          kind,
          name: original.label,
          specification: '',
          description: 'A generic item used in the formatting demonstration.',
          manufacturer: '',
          model: '',
          partNumber: '',
          defaultUnit: 'each',
          visibility: 'public',
        })
      ).item as CatalogItem;
      items.push(item);
    }
    structured.requirements.push({
      id: original.id,
      itemId: item.id,
      itemVersion: item.version,
      role: kind === 'tool' ? ('keep' as const) : ('use' as const),
      name: item.name,
      specification: item.specification,
      description: item.description,
      manufacturer: item.manufacturer,
      model: item.model,
      partNumber: item.partNumber,
      quantity: kind === 'tool' ? 1 : null,
      unit: item.defaultUnit,
      optional: false,
      notes: '',
    });
  }
  structured.unresolvedTools = [];
  return { document: structured, categoryId: guideCategory.id };
}
