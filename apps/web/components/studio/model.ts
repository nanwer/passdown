import type { GuideDocument, GuideDocumentV5, GuideStep } from '@guide/content';
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value))
    return '/studio';
  try {
    const url = new URL(value, 'https://local.invalid');
    return url.origin === 'https://local.invalid' && !url.pathname.startsWith('/sign-in')
      ? url.pathname + url.search + url.hash
      : '/studio';
  } catch {
    return '/studio';
  }
}
export function newStep(): GuideDocumentV5['steps'][number] {
  return {
    id: crypto.randomUUID(),
    title: 'New step',
    body: [{ type: 'paragraph', children: [{ type: 'text', text: '', marks: [] }] }],
    media: [],
    callouts: [],
    requirements: [],
    preconditions: [],
    earlierStepIds: [],
  };
}
export function newDocument(): GuideDocument {
  return {
    schemaVersion: 5,
    requirements: [],
    unresolvedTools: [],
    title: '',
    summary: '',
    locale: 'en',
    difficulty: 'easy',
    durationMinutes: 15,
    tools: [],
    steps: [newStep()],
  };
}
export function reorder<T extends GuideStep>(steps: T[], id: string, delta: number): T[] {
  const index = steps.findIndex((step) => step.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= steps.length) return steps;
  const copy = [...steps];
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  return copy;
}

/**
 * Moves one item within a list, by position rather than by identity.
 *
 * `reorder` keys on a step's id; pictures are identified by the asset they
 * point at, and the same asset could in principle appear twice on a step.
 */
export function moveBy<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  return copy;
}
