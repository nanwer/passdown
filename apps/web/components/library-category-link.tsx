'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MouseEvent, ReactNode } from 'react';

export function LibraryCategoryLink({
  href,
  base,
  category,
  current,
  children,
}: {
  href: string;
  base: string;
  category: string;
  current: boolean;
  children: ReactNode;
}) {
  const router = useRouter();

  const selectCategory = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const query = (document.getElementById('guide-search') as HTMLInputElement | null)?.value ?? '';
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (category) params.set('category', category);
    window.dispatchEvent(new CustomEvent('library-category-navigation', { detail: { query } }));
    router.push(`${base}${params.size ? `?${params.toString()}` : ''}`, { scroll: false });
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
