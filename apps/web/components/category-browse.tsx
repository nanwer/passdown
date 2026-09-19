import Link from 'next/link';
import { ArrowUpRight, FolderTree, ChevronRight } from 'lucide-react';
import type { Category, PublishedGuide } from '@guide/contracts';
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
  guides,
}: {
  categories: Category[];
  parentId?: string | null;
  base: string;
  guides: Pick<PublishedGuide, 'categoryPath'>[];
}) {
  const children = categories.filter(
    (category) => category.parentId === parentId && !category.archived,
  );
  if (!children.length) return null;
  return (
    <section className="category-browse page-width" aria-labelledby="category-browse-title">
      <div className="category-browse-heading">
        <div>
          <span className="eyebrow">{parentId ? 'Keep exploring' : 'Find your way'}</span>
          <h2 id="category-browse-title">{parentId ? 'Subcategories' : 'Browse by category'}</h2>
        </div>
        <p>
          {parentId
            ? 'Choose a branch, or read all guides below.'
            : 'From broad topics to the exact product you need.'}
        </p>
      </div>
      <div className="category-browse-grid">
        {children.map((category) => {
          const count = guides.filter((guide) =>
            guide.categoryPath?.some((part) => part.id === category.id),
          ).length;
          const branches = categories.filter(
            (item) => item.parentId === category.id && !item.archived,
          ).length;
          return (
            <Link
              className="category-browse-card"
              href={`${base}/categories/${category.id}`}
              key={category.id}
            >
              <span className="category-browse-icon">
                <FolderTree size={22} aria-hidden="true" />
              </span>
              <div>
                <h3>{category.name}</h3>
                {category.description && <p>{category.description}</p>}
                <span className="category-browse-count">
                  {count} {count === 1 ? 'guide' : 'guides'}
                  {branches > 0 &&
                    ` · ${branches} ${branches === 1 ? 'subcategory' : 'subcategories'}`}
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
