import * as P from './public-styles';
import Link from 'next/link';
import { words } from '../lib/vocabulary';
import { ArrowUpRight, FolderTree, ChevronRight } from 'lucide-react';
import type { Category, CategoryCounts } from '@guide/contracts';

export function CategoryBreadcrumbs({ category, base }: { category: Category; base: string }) {
  return (
    <nav
      className="mb-[30px] flex flex-wrap items-center gap-[7px] text-[13px] text-muted"
      aria-label="Category breadcrumbs"
    >
      <Link className="hover:text-ink hover:underline" href={base || '/'}>
        All guides
      </Link>
      {category.path.map((part, index) => (
        <span key={part.id} className="contents">
          <ChevronRight size={14} aria-hidden="true" />
          {index === category.path.length - 1 ? (
            <span aria-current="page" className="text-ink wrap-anywhere">
              {part.name}
            </span>
          ) : (
            <Link className="hover:text-ink hover:underline" href={`${base}/categories/${part.id}`}>
              {part.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

export function CategoryBrowse({
  categories,
  parentId = null,
  base,
  counts,
}: {
  categories: Category[];
  parentId?: string | null;
  base: string;
  /**
   * Published guides per category, counted by the database over the same
   * authorized section this page reads. A category absent from the list has
   * none the viewer may open.
   */
  counts: CategoryCounts[];
}) {
  const bySubtree = new Map(counts.map((count) => [count.categoryId, count.publishedSubtree]));
  const children = categories.filter(
    (category) => category.parentId === parentId && !category.archived,
  );
  if (!children.length) return null;
  return (
    <section className={`${P.pageWidth} pt-7 pb-10`} aria-labelledby="category-browse-title">
      <div className="mb-5 flex [align-items:end] justify-between gap-6 max-[640px]:block">
        <div>
          <span className={P.eyebrow}>{parentId ? 'Keep exploring' : 'Find your way'}</span>
          <h2 id="category-browse-title" className="text-[clamp(22px,3vw,30px)] tracking-[-0.04em]">
            {parentId ? `Inside this ${words.thing}` : `Browse ${words.things}`}
          </h2>
        </div>
        <p className="max-w-[360px] text-muted max-[640px]:mt-2">
          {parentId
            ? 'Narrow it down, or read everything below.'
            : 'From the broad group down to the exact one you have.'}
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(290px,100%),1fr))] gap-3.5">
        {children.map((category) => {
          const count = bySubtree.get(category.id) ?? 0;
          const branches = categories.filter(
            (item) => item.parentId === category.id && !item.archived,
          ).length;
          return (
            <Link
              className="flex min-w-0 [align-items:start] gap-4 rounded-[14px] border border-line bg-panel p-6 [transition:border-color_150ms,background_150ms] hover:border-focus hover:bg-raised motion-reduce:transition-none max-[640px]:p-[18px]"
              href={`${base}/categories/${category.id}`}
              key={category.id}
            >
              {/* A picture where there is one, the folder mark where there is
                  not. Browsing a tree works by recognition, and the label may
                  be a model number nobody reads. */}
              {category.imageAssetId ? (
                <img
                  className="block size-14 flex-[0_0_56px] rounded-[10px] border border-line bg-sunken object-cover"
                  src={`/api/media/${category.workspaceId}/${category.imageAssetId}?w=400`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-accent-surface text-accent-ink">
                  <FolderTree size={22} aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="text-[19px] leading-[1.4] wrap-anywhere">{category.name}</h3>
                {category.description && (
                  <p className="mt-1.5 text-[14px] text-muted wrap-anywhere">
                    {category.description}
                  </p>
                )}
                <span className="mt-2.5 block text-[13px] text-muted">
                  {count} {count === 1 ? 'guide' : 'guides'}
                  {branches > 0 && ` · ${branches} inside`}
                </span>
              </div>
              <ArrowUpRight size={19} aria-hidden="true" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
