'use client';
import { useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Check } from 'lucide-react';
import type { Category } from '@guide/contracts';
import { categoryPath, searchCategories } from './tree-model';
import './structured.css';
export interface CategoryTreeProps {
  categories: Category[];
  value?: string | null;
  onSelect: (category: Category) => void;
  query?: string;
  label?: string;
}
export function CategoryTree({
  categories,
  value,
  onSelect,
  query = '',
  label = 'Category tree',
}: CategoryTreeProps) {
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
        {sorted.map((category) => (
          <li key={category.id}>
            <button
              type="button"
              className={value === category.id ? 'selected' : ''}
              onClick={() => onSelect(category)}
            >
              <Folder size={17} aria-hidden="true" />
              <span>
                <strong>{category.name}</strong>
                <small>{categoryPath(category)}</small>
              </span>
              {value === category.id && <Check size={16} aria-hidden="true" />}
            </button>
          </li>
        ))}
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
                  onClick={() => onSelect(category)}
                >
                  {open && children ? (
                    <FolderOpen size={17} aria-hidden="true" />
                  ) : (
                    <Folder size={17} aria-hidden="true" />
                  )}
                  <span>{category.name}</span>
                  {category.archived && <small>Archived</small>}
                  {value === category.id && <Check size={15} aria-hidden="true" />}
                </button>
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
