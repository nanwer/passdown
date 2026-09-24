'use client';
import * as S from './structured-styles';
import { useId, useState, type ReactElement } from 'react';
import { ChevronDown, FolderPlus, Search, ArrowLeft, FolderTree } from 'lucide-react';
import { Button, Dialog } from '@guide/ui';
import type { Category, StudioWorkspace } from '@guide/contracts';
import { words } from '../../lib/vocabulary';
import { studioFetch } from '../studio/transport';
import { ErrorNotice } from '../studio/frame';
import { useCategories, announceStructuredChange } from './data';
import { categoryPath, eligibleCategories } from './tree-model';
import { CategoryTree } from './category-tree';
import { useFormRequest } from './use-form-request';
/**
 * What to call a node of this tree.
 *
 * One tree remains, and it holds the things guides are about. The domain
 * argument outlives the tool and material trees it once told apart.
 */
function nounFor(_domain: Category['domain']) {
  return words;
}

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
  label = 'What is this about?',
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
  const privateSelection = visibility === 'public' && display?.visibility === 'members';
  return (
    <div className={S.picker}>
      <span id={`${id}-label`} className={S.fieldLabel}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </span>
      <Dialog
        size="wide"
        trigger={
          <button
            type="button"
            disabled={disabled}
            className={S.trigger}
            aria-labelledby={`${id}-label ${id}-value`}
            aria-describedby={privateSelection ? `${id}-visibility` : undefined}
          >
            <FolderTree size={17} aria-hidden="true" />
            <span id={`${id}-value`}>
              {display
                ? categoryPath(display)
                : value
                  ? `Selected ${words.thing} unavailable`
                  : required
                    ? `Choose a ${words.thing}`
                    : 'Not inside anything'}
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        }
        title={creating ? `Add a ${nounFor(domain).thing}` : `Choose ${label.toLowerCase()}`}
        description={
          creating
            ? `Add a ${words.thing} without leaving your guide.`
            : 'Browse the tree, or search by name or path.'
        }
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setCreating(false);
        }}
      >
        <div className={S.pickerContent}>
          {creating ? (
            <>
              <button type="button" className={S.back} onClick={() => setCreating(false)}>
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
              <div className={S.search}>
                <Search size={17} aria-hidden="true" />
                <input
                  aria-label={`Search ${words.things}`}
                  placeholder="Search names or full paths…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {!required && (
                <button
                  type="button"
                  className={S.topLevel}
                  onClick={() => {
                    if (disabled) return;
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  Not inside anything
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
                <p role="status">Loading {words.things}…</p>
              ) : (
                <div className={S.treeScroll}>
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
              {allowCreate && workspace.role === 'manage' && (
                <div className={S.pickerFooter}>
                  <Button type="button" variant="secondary" onClick={() => setCreating(true)}>
                    <FolderPlus size={16} />
                    {value
                      ? `Add one inside this ${nounFor(domain).thing}`
                      : `Add a ${nounFor(domain).thing}`}
                  </Button>
                  <small>A new {words.thing} is saved immediately.</small>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>
      {privateSelection && (
        <small id={`${id}-visibility`} className={S.warning} role="status">
          Only workspace members can see {display.name}. Choose a public {words.thing} before
          publishing, or keep this guide internal.
        </small>
      )}
      {display?.archived && (
        <small className={S.warning}>
          This category is archived. Choose an active category before publishing.
        </small>
      )}
    </div>
  );
}
export function CategoryForm({
  workspace,
  domain,
  categories: provided,
  initial,
  initialParent = null,
  initialName = '',
  visibility,
  onSaved,
  onCancel,
}: {
  workspace: StudioWorkspace;
  domain: Category['domain'];
  categories?: Category[];
  initial?: Category;
  initialParent?: string | null;
  initialName?: string;
  visibility?: Category['visibility'];
  onSaved: (category: Category) => void;
  onCancel: () => void;
}) {
  const {
    categories,
    error: categoriesError,
    loading: categoriesLoading,
    refresh: refreshCategories,
  } = useCategories(workspace.id, provided);
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
    if (pending || categoriesLoading || categoriesError) return;
    if (!name.trim()) {
      setError(`Give this ${words.thing} a name.`);
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
          : `Unable to save this ${words.thing}. Your changes are still here.`,
      );
    } finally {
      if (isCurrent()) setPending(false);
    }
  }
  return (
    <div
      className={S.form}
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
          placeholder="e.g. Bicycles, Fridges, Line 3"
          disabled={pending}
        />
      </label>
      {/*
        Creating asks for a name and nothing else. Where something sits is a
        question with no answer yet when the only thing in front of you is an
        empty field — and asking it up front is why every category in this
        application is top-level. Position still comes from where you were
        standing, so it is stated rather than asked. Moving one afterwards is a
        real need, so the control stays; it belongs to editing.
      */}
      {!initial && parent && <p className={S.pathPreview}>Inside {categoryPath(parent)}</p>}
      {initial && (
        <>
          <CategoryPicker
            workspace={workspace}
            domain={domain}
            categories={categories}
            label="Sits inside"
            value={parentId}
            onChange={setParent}
            allowCreate={false}
            excludeIds={[initial.id]}
            visibility={audience}
            disabled={pending}
          />
          <p className={S.pathPreview}>
            {parent ? `${categoryPath(parent)} / ` : ''}
            {name.trim() || initial.name}
          </p>
        </>
      )}
      <label>
        Description <span className={S.optional}>optional</span>
        <textarea
          rows={3}
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={pending}
        />
      </label>
      <div className={S.fieldsRow}>
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
        {/* Ordering is a preference about a list you can see, not a number to
            guess before the list exists. */}
        {initial && (
          <label>
            Shown in position
            <input
              type="number"
              min={0}
              max={100000}
              value={sortOrder}
              onChange={(event) => setSortOrder(Number(event.target.value))}
              disabled={pending}
            />
          </label>
        )}
      </div>
      <p className={S.notice}>
        {audience === 'public'
          ? 'This name and description are public immediately, even before there are any guides here.'
          : 'Only workspace members can see this.'}
        {initial && parentId !== initial.parentId
          ? ' Moving it also moves its descendants. Guide and item identities stay the same.'
          : ''}
      </p>
      {(error || categoriesError) && <ErrorNotice error={error || categoriesError} />}
      {categoriesError && (
        <Button type="button" variant="secondary" onClick={refreshCategories}>
          Retry loading options
        </Button>
      )}
      <div className={S.formActions}>
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
        <Button
          type="button"
          onClick={() => void save()}
          disabled={pending || categoriesLoading || Boolean(categoriesError)}
        >
          {pending ? 'Saving…' : initial ? 'Save' : `Add ${nounFor(domain).thing}`}
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
  open: controlledOpen,
  onOpenChange,
}: {
  workspace: StudioWorkspace;
  domain: Category['domain'];
  categories?: Category[];
  initial?: Category;
  initialParent?: string | null;
  /** Omitted when the dialog is driven by `open` rather than by a control. */
  trigger?: ReactElement;
  onSaved?: (category: Category) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  return (
    <Dialog
      size="wide"
      open={open}
      onOpenChange={setOpen}
      trigger={trigger}
      title={initial ? `Edit ${nounFor(domain).thing}` : `Add a ${nounFor(domain).thing}`}
      description={
        initial
          ? 'Renaming or moving this keeps everything filed under it.'
          : `Give it a name. You can add a picture, a description and ${nounFor(domain).things} inside it afterwards.`
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
