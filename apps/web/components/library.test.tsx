// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { Category, CategoryCounts, PublishedGuide } from '@guide/contracts';

// The library's own client controls are exercised by the browser suites. Here
// the subject is what a bounded page tells a reader about the collection.
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('./library-search-field', () => ({
  LibrarySearchField: ({ label }: { label: string }) => (
    <input type="search" aria-label={label} readOnly />
  ),
}));
vi.mock('./library-category-link', () => ({
  LibraryCategoryLink: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
const { Library } = await import('./library');

afterEach(cleanup);

const guide = (n: number): PublishedGuide => ({
  id: `guide-${n}`,
  workspaceId: 'public',
  title: `Shelved guide ${n}`,
  summary: 'A guide on one page of many.',
  category: 'Bicycles',
  categoryId: 'category-1',
  categoryPath: [{ id: 'category-1', name: 'Bicycles' }],
  audience: 'public',
  state: 'published',
  artwork: 'bicycle',
  author: 'Author',
  updatedAt: '2026-01-01T00:00:00.000Z',
  release: 1,
  isSample: false,
  license: 'CC-BY-4.0',
  document: {
    schemaVersion: 1,
    title: `Shelved guide ${n}`,
    summary: 'A guide on one page of many.',
    locale: 'en',
    difficulty: 'easy',
    durationMinutes: 5,
    tools: [],
    steps: [],
  } as unknown as PublishedGuide['document'],
});
const page = (count: number) => Array.from({ length: count }, (_, n) => guide(n));

it('a bounded page reports the whole collection instead of ending silently', () => {
  render(<Library guides={page(24)} categories={[]} total={176} offset={0} limit={24} />);

  expect(screen.getByRole('heading', { level: 2, name: /A place to start/ })).toHaveTextContent(
    '176',
  );
  expect(screen.getByRole('status')).toHaveTextContent('176 guides found. Showing 1 to 24.');
  const pager = screen.getByRole('navigation', { name: 'Library pages' });
  expect(pager).toHaveTextContent('Showing 1–24 of 176 guides');
  expect(within(pager).getByRole('link', { name: /Next/ })).toHaveAttribute(
    'href',
    '/?page=2#collection',
  );
  expect(within(pager).queryByRole('link', { name: /Previous/ })).toBeNull();
});

it('a later page keeps the search and category, and offers the way back', () => {
  render(
    <Library
      guides={page(24)}
      categories={[]}
      total={176}
      offset={48}
      limit={24}
      query="brake"
      category="category-1"
    />,
  );

  const pager = screen.getByRole('navigation', { name: 'Library pages' });
  expect(pager).toHaveTextContent('Showing 49–72 of 176 guides');
  expect(within(pager).getByRole('link', { name: /Previous/ })).toHaveAttribute(
    'href',
    '/?q=brake&category=category-1&page=2#collection',
  );
  expect(within(pager).getByRole('link', { name: /Next/ })).toHaveAttribute(
    'href',
    '/?q=brake&category=category-1&page=4#collection',
  );
});

it('a collection that fits on one page is shown without a pager', () => {
  render(<Library guides={page(6)} categories={[]} total={6} offset={0} limit={24} />);

  expect(screen.getByRole('status')).toHaveTextContent('6 guides found.');
  expect(screen.getByRole('status')).not.toHaveTextContent('Showing');
  expect(screen.queryByRole('navigation', { name: 'Library pages' })).toBeNull();
});

it('browse cards count guides from the database totals, not from the listed page', () => {
  const taxonomy: Category[] = [
    {
      id: 'category-1',
      workspaceId: 'public',
      code: 'GC-0001',
      name: 'Bicycles',
      domain: 'guide',
      parentId: null,
      description: '',
      visibility: 'public',
      archived: false,
      version: 1,
      sortOrder: 0,
      imageAssetId: null,
      path: [{ id: 'category-1', name: 'Bicycles' }],
    },
  ];
  const counts: CategoryCounts[] = [
    { categoryId: 'category-1', direct: 0, subtree: 0, publishedDirect: 90, publishedSubtree: 176 },
  ];

  render(
    <Library
      guides={page(24)}
      categories={[]}
      taxonomy={taxonomy}
      categoryCounts={counts}
      total={176}
      offset={0}
      limit={24}
    />,
  );

  const browse = screen.getByRole('region', { name: 'Browse things' });
  expect(within(browse).getByRole('link', { name: /Bicycles/ })).toHaveTextContent('176 guides');
});
