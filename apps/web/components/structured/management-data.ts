'use client';

import { useEffect, useRef, useState } from 'react';
import type { CategoryManagementPage, CatalogManagementPage } from '@guide/contracts';
import { studioFetch, errorMessage, type ErrorMessage } from '../studio/transport';
import type { Sort, Status } from './data-table';

export type ManagementFilters = {
  search: string;
  status: Status;
  visibility: 'all' | 'public' | 'members';
  usage: 'all' | 'used' | 'unused';
  sort: Sort;
  page: number;
  reveal?: string | null;
  expanded?: Set<string>;
  collapsed?: Set<string>;
};

/** Only the latest request may replace a page; typing never waits for the network. */
export function useManagementPage<T extends CategoryManagementPage | CatalogManagementPage>(
  workspaceId: string,
  resource: 'categories' | 'catalog',
  filters: ManagementFilters,
) {
  const params = new URLSearchParams({
    page: String(filters.page),
    pageSize: '25',
    search: filters.search,
    status: filters.status,
    visibility: filters.visibility,
    usage: filters.usage,
  });
  if (filters.sort) {
    params.set('sort', filters.sort.key);
    params.set('direction', filters.sort.direction);
  }
  if (filters.reveal) params.set('reveal', filters.reveal);
  if (filters.expanded?.size) params.set('expanded', [...filters.expanded].join(','));
  if (filters.collapsed?.size) params.set('collapsed', [...filters.collapsed].join(','));
  const key = `${workspaceId}/${resource}?${params}`;
  const [result, setResult] = useState<{ key: string; data: T }>();
  const [error, setError] = useState<ErrorMessage>('');
  const [pending, setPending] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  const lastSearch = useRef(filters.search);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === workspaceId) refresh();
    };
    window.addEventListener('guide-structured-data-changed', changed);
    return () => window.removeEventListener('guide-structured-data-changed', changed);
  }, [workspaceId]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const delay = lastSearch.current === filters.search ? 0 : 200;
    lastSearch.current = filters.search;
    setPending(true);
    setError('');
    const timer = setTimeout(() => {
      studioFetch<T>(`/api/studio/${key}`, { signal: controller.signal })
        .then((data) => {
          if (active) setResult({ key, data });
        })
        .catch((error: unknown) => {
          if (active) setError(errorMessage(error, 'This list could not be loaded.'));
        })
        .finally(() => {
          if (active) setPending(false);
        });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, revision]);
  return {
    data: result?.data,
    loading: pending || (!error && result?.key !== key),
    error,
    refresh,
  };
}

/** A record stays open when editing moves it out of the current page or filters. */
export function useManagementRecord<T extends { id: string }>(
  workspaceId: string,
  resource: 'categories' | 'catalog',
  initial: T | null,
) {
  const [record, setRecord] = useState<T | null>(initial);
  const [revision, setRevision] = useState(0);
  const id = initial?.id;
  useEffect(() => setRecord(initial), [initial]);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === workspaceId) setRevision((n) => n + 1);
    };
    window.addEventListener('guide-structured-data-changed', changed);
    return () => window.removeEventListener('guide-structured-data-changed', changed);
  }, [workspaceId]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    studioFetch<{ category?: T; item?: T }>(`/api/studio/${workspaceId}/${resource}/${id}`)
      .then((response) => {
        if (active) setRecord(response.category ?? response.item ?? initial);
      })
      // The table still displays request failures; preserve the open record and edits.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, workspaceId, resource, revision]);
  return record?.id === id ? record : initial;
}
