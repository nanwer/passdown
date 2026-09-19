'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Category, CatalogItem } from '@guide/contracts';
import { studioFetch } from '../studio/transport';
const changeEvent = 'guide-structured-data-changed';
export function announceStructuredChange(workspaceId: string) {
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: workspaceId }));
}
export function useCategories(workspaceId: string, provided?: Category[]) {
  const [categories, setCategories] = useState<Category[]>(provided ?? []);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!provided);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (provided) {
      setCategories(provided);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    studioFetch<{ categories: Category[] }>(
      `/api/studio/${workspaceId}/categories?includeArchived=true`,
    )
      .then((result) => {
        if (active) setCategories(result.categories);
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
          setCategories([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, provided, revision]);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === workspaceId) refresh();
    };
    window.addEventListener(changeEvent, changed);
    return () => window.removeEventListener(changeEvent, changed);
  }, [workspaceId, refresh]);
  return { categories, error, loading, refresh };
}
export function useCatalog(workspaceId: string) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    studioFetch<{ items: CatalogItem[] }>(`/api/studio/${workspaceId}/catalog?includeArchived=true`)
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
          setItems([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, revision]);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === workspaceId) refresh();
    };
    window.addEventListener(changeEvent, changed);
    return () => window.removeEventListener(changeEvent, changed);
  }, [workspaceId, refresh]);
  return { items, error, loading, refresh };
}
