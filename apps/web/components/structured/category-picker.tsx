'use client';
import { useId, useState, type ReactElement } from 'react';
import { ChevronDown, FolderPlus, Search, ArrowLeft, FolderTree } from 'lucide-react';
import { Button, Dialog } from '@guide/ui';
import type { Category, StudioWorkspace } from '@guide/contracts';
import { studioFetch } from '../studio/transport';
import { ErrorNotice } from '../studio/frame';
import { useCategories, announceStructuredChange } from './data';
import { categoryPath, eligibleCategories } from './tree-model';
import { CategoryTree } from './category-tree';
import { useFormRequest } from './use-form-request';
import './structured.css';
export interface CategoryPickerProps {
  workspace: StudioWorkspace;
  domain: Category['domain'];
  value: string | null;
  onChange: (id: string | null, category?: Category) => void;
  label?: string;
  required?: boolean;
  visibility?: Category['visibility'];
  allowCreate?: boolean;
  excludeIds?: string[];
  categories?: Category[];
  disabled?: boolean;
}
export function CategoryPicker({
  workspace,
  domain,
  value,
  onChange,
  label = 'Category',
  required = false,
  visibility,
  allowCreate = true,
  excludeIds,
  categories: provided,
  disabled = false,
}: CategoryPickerProps) {
  const { categories, error, loading, refresh } = useCategories(workspace.id, provided);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const id = useId();
  const eligible = eligibleCategories(categories, { domain, visibility, excludeIds });
  const selected = categories.find((category) => category.id === value);
  const [created, setCreated] = useState<Category>();
  const display = selected ?? (created?.id === value ? created : undefined);
  return (
    <div className="category-picker">
      <span id={`${id}-label`} className="structured-field-label">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      <Dialog
        size="wide"
        trigger={
          <button
            type="button"
            disabled={disabled}
            className="category-picker-trigger"
            aria-labelledby={`${id}-label ${id}-value`}
          >
            <FolderTree size={17} aria-hidden="true" />
            <span id={`${id}-value`}>
              {display
                ? categoryPath(display)
                : value
                  ? 'Selected category unavailable'
                  : required
                    ? 'Choose a category'
                    : 'Top level / none'}
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        }
        title={creating ? 'Create category' : `Choose ${label.toLowerCase()}`}
        description={
          creating
            ? 'Create a reusable category without leaving your guide.'
            : 'Browse the hierarchy or search a full category path.'
        }
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setCreating(false);
        }}
      >
        <div className="structured-picker-content">
          {creating ? (
            <>
              <button type="button" className="structured-back" onClick={() => setCreating(false)}>
                <ArrowLeft size={15} />
                Back to categories
              </button>
              <CategoryForm
                workspace={workspace}
                domain={domain}
                categories={categories}
                initialName={query}
                initialParent={eligible.some((category) => category.id === value) ? value : null}
                visibility={visibility}
                onSaved={(category) => {
                  setCreated(category);
                  if (!disabled) onChange(category.id, category);
                  setOpen(false);
                  setCreating(false);
                  setQuery('');
                  refresh();
                }}
                onCancel={() => setCreating(false)}
              />
            </>
          ) : (
            <>
              <div className="structured-search">
                <Search size={17} aria-hidden="true" />
                <input
                  aria-label="Search categories"
                  placeholder="Search names or full paths…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {!required && (
                <button
                  type="button"
                  className="structured-top-level"
                  onClick={() => {
                    if (disabled) return;
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Top level / none
                </button>
              )}
              {error ? (
                <>
                  <ErrorNotice error={error} />
                  <Button type="button" variant="secondary" onClick={refresh}>
                    Try again
                  </Button>
                </>
              ) : loading ? (
                <p role="status">Loading categories…</p>
              ) : (
                <div className="structured-tree-scroll">
                  <CategoryTree
                    categories={eligible}
                    value={value}
                    query={query}
                    onSelect={(category) => {
                      if (disabled) return;
                      onChange(category.id, category);
                      setOpen(false);
                      setQuery('');
                    }}
                  />
                </div>
              )}
              {allowCreate && workspace.role === 'owner' && (
                <div className="structured-picker-footer">
                  <Button type="button" variant="secondary" onClick={() => setCreating(true)}>
                    <FolderPlus size={16} />
                    {value ? 'Create subcategory' : 'Create category'}
                  </Button>
                  <small>A shared category is saved immediately.</small>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>
      {display?.archived && (
        <small className="structured-warning">
          This category is archived. Choose an active category before publishing.
        </small>
      )}
    </div>
  );
}
export function CategoryForm({
  workspace,
  domain,
  categories,
  initial,
  initialParent = null,
  initialName = '',
  visibility,
  onSaved,
  onCancel,
}: {
  workspace: StudioWorkspace;
  domain: Category['domain'];
  categories: Category[];
  initial?: Category;
  initialParent?: string | null;
  initialName?: string;
  visibility?: Category['visibility'];
  onSaved: (category: Category) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? initialName);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [parentId, setParent] = useState<string | null>(initial?.parentId ?? initialParent);
  const [audience, setAudience] = useState<Category['visibility']>(
    initial?.visibility ?? visibility ?? (workspace.audience === 'public' ? 'public' : 'members'),
  );
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useFormRequest();
  const parent = categories.find((category) => category.id === parentId);
  async function save() {
    if (pending) return;
    if (!name.trim()) {
      setError('Give this category a name.');
      return;
    }
    setPending(true);
    setError('');
    const isCurrent = request.begin();
    try {
      const result = await studioFetch<{ category: Category }>(
        `/api/studio/${workspace.id}/categories${initial ? `/${initial.id}` : ''}`,
        {
          method: initial ? 'PATCH' : 'POST',
          body: JSON.stringify({
            domain,
            parentId,
            name: name.trim(),
            description: description.trim(),
            visibility: audience,
            sortOrder,
            ...(initial ? { expectedVersion: initial.version, archived: initial.archived } : {}),
          }),
        },
      );
      announceStructuredChange(workspace.id);
      if (isCurrent()) onSaved(result.category);
    } catch (error) {
      if (!isCurrent()) return;
      setError(
        error instanceof Error
          ? error.message
          : 'Unable to save this category. Your changes are still here.',
      );
    } finally {
      if (isCurrent()) setPending(false);
    }
  }
  return (
    <div
      className="structured-form"
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          !event.nativeEvent.isComposing &&
          (event.target as HTMLElement).tagName === 'INPUT'
        ) {
          event.preventDefault();
          event.stopPropagation();
          void save();
        }
      }}
    >
      <label>
        Name
        <input
          value={name}
          maxLength={100}
          autoFocus
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Laptops or Phillips screwdrivers"
          disabled={pending}
        />
      </label>
      <CategoryPicker
        workspace={workspace}
        domain={domain}
        categories={categories}
        label="Parent category"
        value={parentId}
        onChange={setParent}
        allowCreate={false}
        excludeIds={initial ? [initial.id] : undefined}
        visibility={audience}
        disabled={pending}
      />
      <p className="structured-path-preview">
        <span>Resulting path</span>
        {parent ? `${categoryPath(parent)} / ` : ''}
        {name.trim() || 'New category'}
      </p>
      <label>
        Description <span className="structured-optional">optional</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={pending}
        />
      </label>
      <div className="structured-fields-row">
        <label>
          Visibility
          <select
            value={audience}
            disabled={pending || workspace.audience === 'private' || visibility === 'public'}
            onChange={(event) => setAudience(event.target.value as Category['visibility'])}
          >
            <option value="public">Public</option>
            <option value="members">Workspace members</option>
          </select>
        </label>
        <label>
          Display order
          <input
            type="number"
            min={0}
            max={100000}
            value={sortOrder}
            onChange={(event) => setSortOrder(Number(event.target.value))}
            disabled={pending}
          />
        </label>
      </div>
      <p className="structured-notice">
        {audience === 'public'
          ? 'This category name and description will be public immediately, even before it has any guides or items.'
          : 'Only workspace members can see this category.'}
        {initial && parentId !== initial.parentId
          ? ' Moving it also moves its descendants. Guide and item identities stay the same.'
          : ''}
      </p>
      {error && <ErrorNotice error={error} />}
      <div className="structured-form-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            request.invalidate();
            onCancel();
          }}
        >
          Cancel
        </Button>
        <Button type="button" onClick={() => void save()} disabled={pending}>
          {pending ? 'Saving…' : initial ? 'Save category' : 'Create category'}
        </Button>
      </div>
    </div>
  );
}
export function CategoryDialog({
  workspace,
  domain,
  categories,
  initial,
  initialParent,
  trigger,
  onSaved,
}: {
  workspace: StudioWorkspace;
  domain: Category['domain'];
  categories: Category[];
  initial?: Category;
  initialParent?: string | null;
  trigger: ReactElement;
  onSaved?: (category: Category) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      size="wide"
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={initial ? 'Edit category' : 'Create category'}
      description={
        initial
          ? 'Rename or move this branch while keeping its identity.'
          : 'A reusable category can have its own subcategories and guides or items.'
      }
    >
      {open && (
        <CategoryForm
          workspace={workspace}
          domain={domain}
          categories={categories}
          initial={initial}
          initialParent={initialParent}
          onCancel={() => setOpen(false)}
          onSaved={(category) => {
            setOpen(false);
            onSaved?.(category);
          }}
        />
      )}
    </Dialog>
  );
}
