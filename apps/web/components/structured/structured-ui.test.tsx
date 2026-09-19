// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import type { Category, CatalogItem, StudioWorkspace } from '@guide/contracts';
import { CategoryTree } from './category-tree';
import { CategoryPicker } from './category-picker';
import { CatalogPicker, CatalogForm } from './catalog-picker';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const workspace: StudioWorkspace = {
  id: 'public',
  name: 'Repair collective',
  audience: 'public',
  role: 'owner',
};
const names = ['Electronics', 'Computers', 'Laptops', 'Maker', 'Model'];
const categories: Category[] = names.map((name, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  workspaceId: 'public',
  name,
  domain: 'guide',
  parentId: index ? `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` : null,
  description: '',
  visibility: 'public',
  archived: false,
  version: 1,
  sortOrder: 0,
  path: names
    .slice(0, index + 1)
    .map((name, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name })),
}));
const toolCategory: Category = {
  ...categories[0]!,
  id: 'tool',
  name: 'Screwdrivers',
  domain: 'tool',
  path: [{ id: 'tool', name: 'Screwdrivers' }],
};
const item: CatalogItem = {
  id: 'item',
  workspaceId: 'public',
  categoryId: 'tool',
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
  categoryPath: toolCategory.path,
};
function Picker() {
  const [value, setValue] = useState<string | null>(categories[4]!.id);
  return (
    <>
      <CategoryPicker
        workspace={workspace}
        domain="guide"
        value={value}
        categories={categories}
        onChange={setValue}
        required
      />
      <output aria-label="Selected category">{value}</output>
    </>
  );
}
describe('structured authoring pickers', () => {
  it('browses five levels and searches full paths without flattening category identity', () => {
    const selected = vi.fn();
    const { rerender } = render(<CategoryTree categories={categories} onSelect={selected} />);
    expect(screen.getByRole('button', { name: 'Model' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Computers' }));
    expect(screen.queryByRole('button', { name: 'Model' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Computers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Model' }));
    expect(selected).toHaveBeenCalledWith(categories[4]);
    rerender(<CategoryTree categories={categories} query="Maker" onSelect={selected} />);
    expect(screen.getByText('Electronics / Computers / Laptops / Maker / Model')).toBeVisible();
  });
  it('preselects the current parent for inline creation and retains input after a rejected duplicate', async () => {
    let attempts = 0;
    let submitted: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        submitted = JSON.parse(init.body);
        attempts++;
        return new Response(
          JSON.stringify(
            attempts === 1
              ? {
                  error: {
                    code: 'DUPLICATE',
                    message: 'A category with this name already exists.',
                  },
                }
              : {
                  category: {
                    ...categories[4],
                    id: 'new-id',
                    name: 'New branch',
                    path: [...categories[4]!.path, { id: 'new-id', name: 'New branch' }],
                  },
                },
          ),
          { status: attempts === 1 ? 409 : 201, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );
    render(<Picker />);
    fireEvent.click(screen.getByRole('button', { name: /^Category/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create subcategory' }));
    const name = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(name, { target: { value: 'New branch' } });
    fireEvent.keyDown(name, { key: 'Enter' });
    await screen.findByRole('alert');
    expect(name).toHaveValue('New branch');
    expect(submitted.parentId).toBe(categories[4]!.id);
    fireEvent.keyDown(name, { key: 'Enter' });
    await waitFor(() =>
      expect(screen.getByLabelText('Selected category')).toHaveTextContent('new-id'),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('selects an already-added catalog item without creating another item', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url) =>
          new Response(
            JSON.stringify(
              String(url).includes('/catalog') ? { items: [item] } : { categories: [toolCategory] },
            ),
            { headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    const selected = vi.fn();
    render(<CatalogPicker workspace={workspace} selectedIds={['item']} onSelect={selected} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add from catalog' }));
    const row = await screen.findByRole('button', { name: /Phillips screwdriver/ });
    expect(within(row).getByText('Added')).toBeVisible();
    fireEvent.click(row);
    expect(selected).toHaveBeenCalledTimes(1);
    expect(selected).toHaveBeenCalledWith(item);
  });
  it('keeps existing catalog kinds fixed while allowing specification edits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ categories: [toolCategory] }), {
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    render(
      <CatalogForm workspace={workspace} initial={item} onSaved={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole('combobox', { name: 'Item type' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Specification / size' })).not.toBeDisabled();
  });
});
it('inherits a selected material category when creating from the all-types catalog picker', async () => {
  const materialCategory: Category = {
    ...toolCategory,
    id: 'chemicals',
    name: 'Cleaning supplies',
    domain: 'material',
    path: [{ id: 'chemicals', name: 'Cleaning supplies' }],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async (url) =>
        new Response(
          JSON.stringify(
            String(url).includes('/catalog') ? { items: [] } : { categories: [materialCategory] },
          ),
          { headers: { 'Content-Type': 'application/json' } },
        ),
    ),
  );
  render(<CatalogPicker workspace={workspace} onSelect={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add from catalog' }));
  fireEvent.click(screen.getByText('Browse item categories'));
  fireEvent.click(await screen.findByRole('button', { name: 'Cleaning supplies' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search catalog' }), {
    target: { value: 'Isopropyl alcohol' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create catalog item' }));
  expect(screen.getByRole('combobox', { name: 'Item type' })).toHaveValue('material');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /^Item category/ })).toHaveTextContent(
      'Cleaning supplies',
    ),
  );
  expect(screen.getByRole('textbox', { name: 'Item name' })).toHaveValue('Isopropyl alcohol');
});

for (const entity of ['category', 'catalog'] as const) {
  for (const cancelWith of ['Back', 'Close', 'Escape', 'Cancel'] as const) {
    it(`keeps new ${entity} edits after cancelling a pending creation with ${cancelWith}`, async () => {
      let completeRequest!: (response: Response) => void;
      const pendingResponse = new Promise<Response>((resolve) => {
        completeRequest = resolve;
      });
      const fetch = vi.fn(async (url, init) => {
        if (init?.method === 'POST') return pendingResponse;
        return new Response(
          JSON.stringify(
            String(url).includes('/catalog') ? { items: [item] } : { categories: [toolCategory] },
          ),
          { headers: { 'Content-Type': 'application/json' } },
        );
      });
      vi.stubGlobal('fetch', fetch);
      const selected = vi.fn();
      const announced = vi.fn();
      window.addEventListener('guide-structured-data-changed', announced, { once: true });
      render(
        entity === 'category' ? (
          <CategoryPicker
            workspace={workspace}
            domain="guide"
            value={null}
            onChange={selected}
            categories={categories}
            required
          />
        ) : (
          <CatalogPicker workspace={workspace} onSelect={selected} />
        ),
      );
      const open = () =>
        fireEvent.click(
          screen.getByRole('button', {
            name: entity === 'category' ? /^Category/ : 'Add from catalog',
          }),
        );
      const create = () =>
        fireEvent.click(
          screen.getByRole('button', {
            name: entity === 'category' ? 'Create category' : 'Create catalog item',
          }),
        );
      const field = () =>
        screen.getByRole('textbox', { name: entity === 'category' ? 'Name' : 'Item name' });
      open();
      create();
      fireEvent.change(field(), { target: { value: 'First attempt' } });
      if (entity === 'catalog') {
        fireEvent.click(screen.getByRole('button', { name: /^Item category/ }));
        fireEvent.click(await screen.findByRole('button', { name: 'Screwdrivers' }));
      }
      fireEvent.click(
        screen.getByRole('button', {
          name: entity === 'category' ? 'Create category' : 'Create item',
        }),
      );
      expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
      if (cancelWith === 'Escape') fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      else
        fireEvent.click(
          screen.getByRole('button', {
            name:
              cancelWith === 'Back'
                ? entity === 'category'
                  ? 'Back to categories'
                  : 'Back to catalog'
                : cancelWith === 'Close'
                  ? 'Close dialog'
                  : 'Cancel',
          }),
        );
      if (cancelWith === 'Close' || cancelWith === 'Escape') open();
      create();
      fireEvent.change(field(), { target: { value: 'Newer unsaved input' } });
      await act(async () => {
        completeRequest(
          new Response(
            JSON.stringify(
              entity === 'category'
                ? { category: { ...categories[0], id: 'created', name: 'First attempt' } }
                : { item: { ...item, id: 'created', name: 'First attempt' } },
            ),
            {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      });
      expect(selected).not.toHaveBeenCalled();
      expect(field()).toHaveValue('Newer unsaved input');
      expect(announced).toHaveBeenCalledTimes(1);
      window.removeEventListener('guide-structured-data-changed', announced);
    });
  }
}
