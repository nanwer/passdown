// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { CatalogManagementPage } from '@guide/contracts';
import { announceStructuredChange } from './data';
import { useManagementPage, useManagementRecord, type ManagementFilters } from './management-data';

type HeldRequest = {
  url: string;
  resolve: (response: Response) => void;
};
let requests: HeldRequest[];
const workspace = 'workspace-a';
const filters: ManagementFilters = {
  search: '',
  status: 'active',
  visibility: 'all',
  usage: 'all',
  sort: { key: 'name', direction: 'ascending' },
  page: 1,
};
const pageData = (total: number): CatalogManagementPage => ({
  items: [],
  usage: [],
  total,
  page: 1,
  pageSize: 25,
  statusCounts: { all: total, active: total, inactive: 0 },
});

beforeEach(() => {
  requests = [];
  // Deliberately ignore AbortSignal. A canceled request can still settle, and
  // neither its old results nor its error should replace a newer response.
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => new Promise<Response>((resolve) => requests.push({ url, resolve }))),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function reply(index: number, body: unknown, status = 200) {
  await act(async () => {
    requests[index]!.resolve(new Response(JSON.stringify(body), { status }));
  });
}

for (const staleResponse of ['results', 'error']) {
  it(`keeps the latest search when an earlier request finishes with ${staleResponse}`, async () => {
    const { result, rerender } = renderHook(
      ({ search }) =>
        useManagementPage<CatalogManagementPage>(workspace, 'catalog', { ...filters, search }),
      { initialProps: { search: 'driver' } },
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    rerender({ search: 'wrench' });
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(new URL(requests[1]!.url, 'http://example.test').searchParams.get('search')).toBe(
      'wrench',
    );
    await reply(1, pageData(2));
    expect(result.current.data?.total).toBe(2);
    expect(result.current.loading).toBe(false);

    if (staleResponse === 'results') await reply(0, pageData(12));
    else await reply(0, { error: { message: 'Earlier search failed.' } }, 503);

    expect(result.current.data?.total).toBe(2);
    expect(result.current.error).toBe('');
    expect(result.current.loading).toBe(false);
  });
}

for (const hasPreviousPage of [false, true]) {
  it(`stops loading after a server error and retries ${hasPreviousPage ? 'without hiding the error behind an older page' : 'on the initial load'}`, async () => {
    const { result, rerender } = renderHook(
      ({ status }: { status: ManagementFilters['status'] }) =>
        useManagementPage<CatalogManagementPage>(workspace, 'catalog', { ...filters, status }),
      { initialProps: { status: 'active' } },
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    let failedRequest = 0;
    if (hasPreviousPage) {
      await reply(0, pageData(14));
      rerender({ status: 'inactive' });
      await waitFor(() => expect(requests).toHaveLength(2));
      failedRequest = 1;
    }
    await reply(failedRequest, { error: { message: 'Catalog is temporarily unavailable.' } }, 503);
    expect(result.current.error).toBe('Catalog is temporarily unavailable.');
    expect(result.current.loading).toBe(false);
    if (hasPreviousPage) expect(result.current.data?.total).toBe(14);

    act(() => result.current.refresh());
    await waitFor(() => expect(requests).toHaveLength(failedRequest + 2));
    expect(result.current.loading).toBe(true);
    await reply(failedRequest + 1, pageData(3));
    expect(result.current.error).toBe('');
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.total).toBe(3);
  });
}

it('refreshes the open record after its workspace changes without replacing the initial selection', async () => {
  const initial = { id: 'thing-a', name: 'Original name', version: 1 };
  const { result } = renderHook(() => useManagementRecord(workspace, 'categories', initial));
  await waitFor(() => expect(requests).toHaveLength(1));
  await reply(0, { category: initial });

  act(() => announceStructuredChange('another-workspace'));
  expect(requests).toHaveLength(1);

  act(() => announceStructuredChange(workspace));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]!.url).toBe(`/api/studio/${workspace}/categories/thing-a`);
  expect(result.current).toEqual(initial);
  await reply(1, { category: { ...initial, name: 'Changed name', version: 2 } });
  expect(result.current).toEqual({ ...initial, name: 'Changed name', version: 2 });
});
