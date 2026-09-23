'use client';
import { cn } from '@guide/ui';
import * as S from './structured-styles';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Check, Plus } from 'lucide-react';
import type { Category, CategoryCounts } from '@guide/contracts';
import { categoryPath, searchCategories } from './tree-model';
import { words } from '../../lib/vocabulary';
export interface CategoryTreeProps {
  categories: Category[];
  value?: string | null;
  onSelect: (category: Category) => void;
  query?: string;
  label?: string;
  /** Distinct-guide totals by category id. Omitted on selection-only surfaces. */
  counts?: Map<string, CategoryCounts>;
  /**
   * Offered per row where creating is possible. Position then comes from the
   * row you pressed rather than from a field asking where to put it.
   */
  onAddChild?: (category: Category) => void;
  addChildLabel?: (category: Category) => string;
  /**
   * Show each thing's picture in place of the folder mark.
   *
   * On by request rather than always: the picture is the point of the manager,
   * where the control to add one lives two panels away and a row that looks
   * identical whether or not a picture exists is why nobody found it. A picker
   * you open mid-sentence while writing wants a list, not a gallery.
   */
  pictures?: boolean;
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
  label = words.Things,
  counts,
  onAddChild,
  addChildLabel = (category) => `Add something inside ${category.name}`,
  pictures = false,
}: CategoryTreeProps) {
  /** The picture where there is one, and the folder mark where there is not. */
  function mark(category: Category, open: boolean) {
    if (pictures && category.imageAssetId)
      return (
        <img
          className={S.nodePicture}
          src={`/api/media/${category.workspaceId}/${category.imageAssetId}?w=400`}
          alt=""
          loading="lazy"
          decoding="async"
        />
      );
    return open ? (
      <FolderOpen size={17} aria-hidden="true" />
    ) : (
      <Folder size={17} aria-hidden="true" />
    );
  }
  /**
   * Code and totals describe a row; they are not part of its name. Keeping them
   * out of the accessible name stops every row announcing as
   * "Electronics GC-0005 12 guides" while still making both available.
   */
  function rowExtras(category: Category) {
    const described = describeCount(counts?.get(category.id));
    const descriptionId = `category-description-${category.id}`;
    const description = described?.full ?? '';
    return {
      descriptionId,
      describedBy: description ? descriptionId : undefined,
      badges: (
        <>
          {described && (
            <small className={S.nodeCount} aria-hidden="true" title={described.full}>
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
  /**
   * A branch the viewer has folded away stays folded — until something inside
   * it becomes the selection. Creating a child of a collapsed parent used to
   * leave it invisible, which reads as the creation having failed.
   */
  useEffect(() => {
    if (!value) return;
    const byId = new Map(categories.map((category) => [category.id, category]));
    const ancestors = new Set<string>();
    let current = byId.get(value)?.parentId ?? null;
    while (current) {
      ancestors.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
    if (!ancestors.size) return;
    setCollapsed((folded) => {
      if (![...ancestors].some((id) => folded.has(id))) return folded;
      const next = new Set(folded);
      for (const id of ancestors) next.delete(id);
      return next;
    });
  }, [value, categories]);
  const sorted = searchCategories(categories, query);
  if (!sorted.length)
    return (
      <p className={S.empty}>
        {query ? 'Nothing matches that. Try another name.' : 'Nothing here yet.'}
      </p>
    );
  if (query.trim())
    return (
      <ul className={S.results} aria-label={label}>
        {sorted.map((category) => {
          const extras = rowExtras(category);
          return (
            <li key={category.id}>
              <button
                type="button"
                className={cn(S.result, value === category.id && S.resultSelected)}
                aria-describedby={extras.describedBy}
                onClick={() => onSelect(category)}
              >
                {mark(category, false)}
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
              <div className={S.treeRow}>
                {children ? (
                  <button
                    className={S.expander}
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
                  <span className={S.leafSpacer} />
                )}
                <button
                  type="button"
                  className={cn(S.node, value === category.id && S.nodeSelected)}
                  title={categoryPath(category)}
                  aria-pressed={value === category.id}
                  aria-describedby={extras.describedBy}
                  onClick={() => onSelect(category)}
                >
                  {mark(category, open && children)}
                  <span>{category.name}</span>
                  {extras.badges}
                  {category.archived && <small>Archived</small>}
                  {value === category.id && <Check size={15} aria-hidden="true" />}
                </button>
                {onAddChild && !category.archived && (
                  <button
                    type="button"
                    className={S.addChild}
                    aria-label={addChildLabel(category)}
                    onClick={() => onAddChild(category)}
                  >
                    <Plus size={15} aria-hidden="true" />
                  </button>
                )}
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
    <nav className={S.tree} aria-label={label}>
      {branch(null)}
    </nav>
  );
}
