'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Check } from 'lucide-react';
import type { Category, CategoryCounts } from '@guide/contracts';
import { categoryPath, searchCategories } from './tree-model';
import './structured.css';
export interface CategoryTreeProps {
  categories: Category[];
  value?: string | null;
  onSelect: (category: Category) => void;
  query?: string;
  label?: string;
  /** Distinct-guide totals by category id. Omitted on selection-only surfaces. */
  counts?: Map<string, CategoryCounts>;
}
/**
 * "12 guides" with the breakdown behind it, or null when nothing is assigned.
 * The total covers the whole subtree, so a parent reflects its children.
 */
export function describeCount(counts?: CategoryCounts) {
  if (!counts || counts.subtree === 0) return null;
  const guides = `${counts.subtree} ${counts.subtree === 1 ? 'guide' : 'guides'}`;
  const nested = counts.subtree - counts.direct;
  return {
    short: guides,
    full:
      nested === 0
        ? `${guides}, all assigned here`
        : `${guides}: ${counts.direct} here and ${nested} in subcategories`,
  };
}
export function CategoryTree({
  categories,
  value,
  onSelect,
  query = '',
  label = 'Category tree',
  counts,
}: CategoryTreeProps) {
  /**
   * Code and totals describe a row; they are not part of its name. Keeping them
   * out of the accessible name stops every row announcing as
   * "Electronics GC-0005 12 guides" while still making both available.
   */
  function rowExtras(category: Category) {
    const described = describeCount(counts?.get(category.id));
    const descriptionId = `category-description-${category.id}`;
    const description = [category.code, described?.full].filter(Boolean).join('. ');
    return {
      descriptionId,
      describedBy: description ? descriptionId : undefined,
      badges: (
        <>
          <small className="category-code" aria-hidden="true">
            {category.code}
          </small>
          {described && (
            <small className="category-count" aria-hidden="true" title={described.full}>
              {described.short}
            </small>
          )}
        </>
      ),
      description: description ? (
        <span id={descriptionId} className="sr-only">
          {description}
        </span>
      ) : null,
    };
  }
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const sorted = searchCategories(categories, query);
  if (!sorted.length)
    return (
      <p className="structured-empty">
        {query
          ? 'No categories match. Try another name or create a category.'
          : 'No categories yet. Create the first one to start organizing.'}
      </p>
    );
  if (query.trim())
    return (
      <ul className="category-results" aria-label={label}>
        {sorted.map((category) => {
          const extras = rowExtras(category);
          return (
            <li key={category.id}>
              <button
                type="button"
                className={value === category.id ? 'selected' : ''}
                aria-describedby={extras.describedBy}
                onClick={() => onSelect(category)}
              >
                <Folder size={17} aria-hidden="true" />
                <span>
                  <strong>{category.name}</strong>
                  <small>{categoryPath(category)}</small>
                </span>
                {extras.badges}
                {value === category.id && <Check size={16} aria-hidden="true" />}
              </button>
              {extras.description}
            </li>
          );
        })}
      </ul>
    );
  const ids = new Set(categories.map((category) => category.id));
  function branch(parentId: string | null) {
    const rows = sorted.filter((category) =>
      parentId === null
        ? !category.parentId || !ids.has(category.parentId)
        : category.parentId === parentId,
    );
    return (
      <ul>
        {rows.map((category) => {
          const children = categories.some((child) => child.parentId === category.id);
          const open = !collapsed.has(category.id);
          const extras = rowExtras(category);
          return (
            <li key={category.id}>
              <div className="category-tree-row">
                {children ? (
                  <button
                    className="category-expander"
                    type="button"
                    aria-label={`${open ? 'Collapse' : 'Expand'} ${category.name}`}
                    aria-expanded={open}
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (open) next.add(category.id);
                        else next.delete(category.id);
                        return next;
                      })
                    }
                  >
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                ) : (
                  <span className="category-leaf-spacer" />
                )}
                <button
                  type="button"
                  className={`category-node ${value === category.id ? 'selected' : ''}`}
                  title={categoryPath(category)}
                  aria-pressed={value === category.id}
                  aria-describedby={extras.describedBy}
                  onClick={() => onSelect(category)}
                >
                  {open && children ? (
                    <FolderOpen size={17} aria-hidden="true" />
                  ) : (
                    <Folder size={17} aria-hidden="true" />
                  )}
                  <span>{category.name}</span>
                  {extras.badges}
                  {category.archived && <small>Archived</small>}
                  {value === category.id && <Check size={15} aria-hidden="true" />}
                </button>
                {extras.description}
              </div>
              {children && open && branch(category.id)}
            </li>
          );
        })}
      </ul>
    );
  }
  return (
    <nav className="category-tree" aria-label={label}>
      {branch(null)}
    </nav>
  );
}
