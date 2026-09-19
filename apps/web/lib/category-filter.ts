import type { Category } from '@guide/contracts';

// Older bookmarks used display names. Resolve only within the caller's permitted
// taxonomy; duplicate names must never silently select unrelated branches.
export function resolveCategoryFilter(categories: Category[], value: string) {
  if (!value) return undefined;
  const eligible = categories.filter((item) => item.domain === 'guide' && !item.archived);
  const exact = eligible.find((item) => item.id === value);
  if (exact) return exact;
  const normalize = (name: string) =>
    name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en');
  const matches = eligible.filter((item) => normalize(item.name) === normalize(value));
  return matches.length === 1 ? matches[0] : undefined;
}
