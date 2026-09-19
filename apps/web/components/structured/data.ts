'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Category, CategoryCounts, CatalogItem } from '@guide/contracts';
import { studioFetch } from '../studio/transport';
const changeEvent = 'guide-structured-data-changed';
export function announceStructuredChange(workspaceId: string) {
  window.dispatchEvent(new CustomEvent(changeEvent, { detail: workspaceId }));
}
/**
 * Categories for a workspace. Management surfaces pass `withCounts` to also
 * load distinct-guide totals; inline pickers leave it off so choosing a
 * category never pays the cost of counting.
 */
export function useCategories(
  workspaceId: string,
  provided?: Category[],
  options?: { withCounts?: boolean },
) {
  const withCounts = options?.withCounts === true;
  const [categories, setCategories] = useState<Category[]>(provided ?? []);
  const [counts, setCounts] = useState<CategoryCounts[]>([]);
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
    studioFetch<{ categories: Category[]; counts?: CategoryCounts[] }>(
      `/api/studio/${workspaceId}/categories?includeArchived=true${withCounts ? '&counts=true' : ''}`,
    )
      .then((result) => {
        if (!active) return;
        setCategories(result.categories);
        setCounts(result.counts ?? []);
      })
      .catch((error) => {
        if (active) {
          setError(error.message);
          setCategories([]);
          setCounts([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, provided, revision, withCounts]);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === workspaceId) refresh();
    };
    window.addEventListener(changeEvent, changed);
    return () => window.removeEventListener(changeEvent, changed);
  }, [workspaceId, refresh]);
  return { categories, counts, error, loading, refresh };
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
