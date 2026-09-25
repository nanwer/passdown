'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Category, CategoryCounts, CatalogItem, CatalogUsageCounts } from '@guide/contracts';
import { studioFetch, errorMessage, type ErrorMessage } from '../studio/transport';
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
  const [error, setError] = useState<ErrorMessage>('');
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
          setError(errorMessage(error, 'These could not be loaded.'));
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
/** Catalog items, with distinct-guide usage on management surfaces. */
export function useCatalog(workspaceId: string, options?: { withUsage?: boolean }) {
  const withUsage = options?.withUsage === true;
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [usage, setUsage] = useState<CatalogUsageCounts[]>([]);
  const [error, setError] = useState<ErrorMessage>('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    studioFetch<{ items: CatalogItem[]; usage?: CatalogUsageCounts[] }>(
      `/api/studio/${workspaceId}/catalog?includeArchived=true${withUsage ? '&usage=true' : ''}`,
    )
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setUsage(result.usage ?? []);
      })
      .catch((error) => {
        if (active) {
          setError(errorMessage(error, 'The catalog could not be loaded.'));
          setItems([]);
          setUsage([]);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, revision, withUsage]);
  useEffect(() => {
    const changed = (event: Event) => {
      if ((event as CustomEvent<string>).detail === workspaceId) refresh();
    };
    window.addEventListener(changeEvent, changed);
    return () => window.removeEventListener(changeEvent, changed);
  }, [workspaceId, refresh]);
  return { items, usage, error, loading, refresh };
}
