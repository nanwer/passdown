'use client';

import Form from 'next/form';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Search } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CompositionEvent,
  type FormEvent,
} from 'react';

const LIVE_SEARCH_DELAY_MS = 250;

export function LibrarySearchField({
  query,
  category,
  base,
  label,
  placeholder,
  buttonLabel,
}: {
  query: string;
  category: string;
  base: string;
  label: string;
  placeholder: string;
  buttonLabel: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  const [isPending, startTransition] = useTransition();
  const valueRef = useRef(value);
  const composingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const navigate = (nextQuery: string, mode: 'push' | 'replace') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const params = new URLSearchParams();
    if (nextQuery) params.set('q', nextQuery);
    if (category) params.set('category', category);
    const href = `${base}${params.size ? `?${params.toString()}` : ''}`;
    startTransition(() => router[mode](href, { scroll: false }));
  };

  const scheduleSearch = (nextValue: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => navigate(nextValue, 'replace'), LIVE_SEARCH_DELAY_MS);
  };

  useEffect(() => {
    // A response may finish before the debounce for a newer edit has fired.
    // Only acknowledge it when it still matches the text being edited.
    if (!dirtyRef.current || query === valueRef.current) {
      setValue(query);
      valueRef.current = query;
      dirtyRef.current = false;
    }
  }, [query]);

  useEffect(() => {
    const categoryNavigation = (event: Event) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const nextQuery = (event as CustomEvent<{ query: string }>).detail.query;
      valueRef.current = nextQuery;
    };
    const restoreHistory = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const restoredQuery =
        new URLSearchParams(window.location.search).get('q')?.slice(0, 200) ?? '';
      setValue(restoredQuery);
      valueRef.current = restoredQuery;
      dirtyRef.current = false;
    };
    window.addEventListener('library-category-navigation', categoryNavigation);
    window.addEventListener('popstate', restoreHistory);
    return () => {
      window.removeEventListener('library-category-navigation', categoryNavigation);
      window.removeEventListener('popstate', restoreHistory);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(valueRef.current, 'push');
  };

  const finishComposition = (event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    const nextValue = event.currentTarget.value;
    valueRef.current = nextValue;
    scheduleSearch(nextValue);
  };

  return (
    <Form action={base} scroll={false} role="search" className="search-form" onSubmit={submit}>
      <Search size={18} aria-hidden="true" />
      <label className="sr-only" htmlFor="guide-search">
        {label}
      </label>
      <input
        id="guide-search"
        type="search"
        name="q"
        value={value}
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          setValue(nextValue);
          valueRef.current = nextValue;
          dirtyRef.current = true;
          if (!composingRef.current) scheduleSearch(nextValue);
        }}
        onCompositionStart={() => {
          composingRef.current = true;
          if (timerRef.current) clearTimeout(timerRef.current);
        }}
        onCompositionEnd={finishComposition}
        placeholder={placeholder}
        maxLength={200}
        aria-describedby="guide-search-feedback"
      />
      {category && <input type="hidden" name="category" value={category} />}
      <button className="search-submit" type="submit" aria-label={buttonLabel}>
        <ArrowUpRight size={18} />
      </button>
      <span id="guide-search-feedback" className="search-feedback" aria-live="polite">
        {isPending ? 'Updating results…' : ''}
      </span>
    </Form>
  );
}
