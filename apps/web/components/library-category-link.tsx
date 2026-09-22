'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

export function LibraryCategoryLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: ReactNode;
}) {
  const router = useRouter();

  /**
   * Follows its own href, carrying whatever is in the search box right now.
   *
   * It used to rebuild the address from scratch as `?category=`, ignoring the
   * href entirely — so when a category gained its own page the link said one
   * thing and the click did another.
   *
   * The live value matters because the search box debounces: someone who types
   * and immediately picks a category would otherwise lose the last few letters,
   * which the server has not been told about yet.
   */
  const selectCategory = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const query = (document.getElementById('guide-search') as HTMLInputElement | null)?.value ?? '';
    const next = new URL(href, window.location.origin);
    if (query) next.searchParams.set('q', query);
    else next.searchParams.delete('q');
    window.dispatchEvent(new CustomEvent('library-category-navigation', { detail: { query } }));
    router.push(`${next.pathname}${next.search}`, { scroll: false });
  };

  return (
    <Link
      href={href}
      scroll={false}
      aria-current={current ? 'true' : undefined}
      onClick={selectCategory}
    >
      {children}
    </Link>
  );
}
