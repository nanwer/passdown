import Link from 'next/link';
import { words } from '../lib/vocabulary';
import { ArrowUpRight, FolderTree, ChevronRight } from 'lucide-react';
import type { Category, CategoryCounts } from '@guide/contracts';
import './category-browse.css';

export function CategoryBreadcrumbs({ category, base }: { category: Category; base: string }) {
  return (
    <nav className="category-breadcrumbs" aria-label="Category breadcrumbs">
      <Link href={base || '/'}>All guides</Link>
      {category.path.map((part, index) => (
        <span key={part.id}>
          <ChevronRight size={14} aria-hidden="true" />
          {index === category.path.length - 1 ? (
            <span aria-current="page">{part.name}</span>
          ) : (
            <Link href={`${base}/categories/${part.id}`}>{part.name}</Link>
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
    <section className="category-browse page-width" aria-labelledby="category-browse-title">
      <div className="category-browse-heading">
        <div>
          <span className="eyebrow">{parentId ? 'Keep exploring' : 'Find your way'}</span>
          <h2 id="category-browse-title">
            {parentId ? `Inside this ${words.thing}` : `Browse ${words.things}`}
          </h2>
        </div>
        <p>
          {parentId
            ? 'Narrow it down, or read everything below.'
            : 'From the broad group down to the exact one you have.'}
        </p>
      </div>
      <div className="category-browse-grid">
        {children.map((category) => {
          const count = bySubtree.get(category.id) ?? 0;
          const branches = categories.filter(
            (item) => item.parentId === category.id && !item.archived,
          ).length;
          return (
            <Link
              className="category-browse-card"
              href={`${base}/categories/${category.id}`}
              key={category.id}
            >
              {/* A picture where there is one, the folder mark where there is
                  not. Browsing a tree works by recognition, and the label may
                  be a model number nobody reads. */}
              {category.imageAssetId ? (
                <img
                  className="category-browse-image"
                  src={`/api/media/${category.workspaceId}/${category.imageAssetId}?w=400`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="category-browse-icon">
                  <FolderTree size={22} aria-hidden="true" />
                </span>
              )}
              <div>
                <h3>{category.name}</h3>
                {category.description && <p>{category.description}</p>}
                <span className="category-browse-count">
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
