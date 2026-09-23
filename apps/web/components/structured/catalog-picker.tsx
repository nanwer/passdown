'use client';
import { useState, type ReactElement } from 'react';
import { Plus, Search, ArrowLeft, Package, Check } from 'lucide-react';
import { Button, Dialog } from '@guide/ui';
import type { Category, CatalogItem, StudioWorkspace } from '@guide/contracts';
import { studioFetch } from '../studio/transport';
import { ErrorNotice } from '../studio/frame';
import { announceStructuredChange, useCatalog } from './data';
import { filterCatalog } from './tree-model';
import { useFormRequest } from './use-form-request';
import './structured.css';
export interface CatalogPickerProps {
  workspace: StudioWorkspace;
  onSelect: (item: CatalogItem) => void;
  selectedIds?: string[];
  visibility?: Category['visibility'];
  label?: string;
  disabled?: boolean;
}
export function CatalogPicker({
  workspace,
  onSelect,
  selectedIds = [],
  visibility,
  label = 'Add from catalog',
  disabled = false,
}: CatalogPickerProps) {
  const { items, error, loading, refresh } = useCatalog(workspace.id);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const available = filterCatalog(items, {
    search,
    visibility,
  });
  return (
    <Dialog
      size="wide"
      trigger={
        <Button type="button" variant="secondary" disabled={disabled}>
          <Plus size={16} />
          {label}
        </Button>
      }
      title={creating ? 'Create catalog item' : 'Choose from the catalog'}
      description={
        creating
          ? 'Create a reusable item, then add it to this guide.'
          : 'Choose an exact item or specification. Shared catalog entries can be reused across guides.'
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
            <button className="structured-back" type="button" onClick={() => setCreating(false)}>
              <ArrowLeft size={15} />
              Back to catalog
            </button>
            <CatalogForm
              workspace={workspace}
              initialName={search}
              visibility={visibility}
              onCancel={() => setCreating(false)}
              onSaved={(item) => {
                if (!disabled) onSelect(item);
                setCreating(false);
                setOpen(false);
                setSearch('');
                refresh();
              }}
            />
          </>
        ) : (
          <>
            <div className="structured-search">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Search catalog"
                placeholder="Search names, specifications, models…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            {error ? (
              <>
                <ErrorNotice error={error} />
                <Button type="button" variant="secondary" onClick={refresh}>
                  Try again
                </Button>
              </>
            ) : loading ? (
              <p role="status">Loading catalog…</p>
            ) : (
              <div className="catalog-picker-results" aria-live="polite">
                {available.length ? (
                  <ul>
                    {available.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (disabled) return;
                            onSelect(item);
                            setOpen(false);
                          }}
                        >
                          <span className="catalog-kind-icon">
                            <Package size={20} />
                          </span>
                          <span className="catalog-item-copy">
                            <strong>{item.name}</strong>
                            {item.specification && <span>{item.specification}</span>}
                          </span>
                          <span className="catalog-picker-status">
                            {selectedIds.includes(item.id) ? (
                              <>
                                <Check size={15} />
                                Added
                              </>
                            ) : (
                              <Plus size={17} />
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="structured-empty">
                    {workspace.role === 'manage'
                      ? 'No matching items. Try another name or specification, or create the exact item you need.'
                      : 'No matching items. Try another name or specification.'}
                  </p>
                )}
              </div>
            )}
            {workspace.role === 'manage' && (
              <div className="structured-picker-footer">
                <Button type="button" variant="secondary" onClick={() => setCreating(true)}>
                  <Plus size={16} />
                  Create catalog item
                </Button>
                <small>The shared item is saved immediately.</small>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
export const unitLabels = {
  each: 'Each',
  pair: 'Pair',
  g: 'Grams (g)',
  kg: 'Kilograms (kg)',
  ml: 'Millilitres (ml)',
  l: 'Litres (l)',
  mm: 'Millimetres (mm)',
  cm: 'Centimetres (cm)',
  m: 'Metres (m)',
} as const;
export function CatalogForm({
  workspace,
  initial,
  initialName = '',
  initialCategoryId = null,
  visibility,
  onSaved,
  onCancel,
}: {
  workspace: StudioWorkspace;
  initial?: CatalogItem;
  initialName?: string;
  initialCategoryId?: string | null;
  visibility?: Category['visibility'];
  onSaved: (item: CatalogItem) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? initialName);
  const [specification, setSpecification] = useState(initial?.specification ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? '');
  const [model, setModel] = useState(initial?.model ?? '');
  const [partNumber, setPartNumber] = useState(initial?.partNumber ?? '');
  const [defaultUnit, setUnit] = useState<CatalogItem['defaultUnit']>(
    initial?.defaultUnit ?? 'each',
  );
  const [audience, setAudience] = useState<Category['visibility']>(
    initial?.visibility ?? visibility ?? (workspace.audience === 'public' ? 'public' : 'members'),
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const request = useFormRequest();
  async function save() {
    if (pending) return;
    if (!name.trim()) {
      setError('Give the item a name.');
      return;
    }
    setPending(true);
    setError('');
    const isCurrent = request.begin();
    try {
      const { item } = await studioFetch<{ item: CatalogItem }>(
        `/api/studio/${workspace.id}/catalog${initial ? `/${initial.id}` : ''}`,
        {
          method: initial ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name: name.trim(),
            specification: specification.trim(),
            description: description.trim(),
            manufacturer: manufacturer.trim(),
            model: model.trim(),
            partNumber: partNumber.trim(),
            defaultUnit,
            visibility: audience,
            ...(initial ? { expectedVersion: initial.version, archived: initial.archived } : {}),
          }),
        },
      );
      announceStructuredChange(workspace.id);
      if (isCurrent()) onSaved(item);
    } catch (error) {
      if (!isCurrent()) return;
      setError(
        error instanceof Error ? error.message : 'Unable to save. Your input is still here.',
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
      <div className="structured-fields-row">
        <label>
          Default unit
          <select
            value={defaultUnit}
            disabled={pending}
            onChange={(event) => setUnit(event.target.value as CatalogItem['defaultUnit'])}
          >
            {Object.entries(unitLabels).map(([unit, label]) => (
              <option key={unit} value={unit}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {initial && (
        <p className="structured-notice">
          Create another catalog item for a different type. Existing requirements keep this item’s
          identity.
        </p>
      )}
      <label>
        Item name
        <input
          autoFocus
          value={name}
          maxLength={160}
          onChange={(event) => setName(event.target.value)}
          disabled={pending}
          placeholder="e.g. Phillips screwdriver"
        />
      </label>
      <label>
        Specification / size
        <input
          value={specification}
          maxLength={500}
          onChange={(event) => setSpecification(event.target.value)}
          disabled={pending}
          placeholder="e.g. Phillips #00, M2 × 4 mm, or 99%"
        />
      </label>
      <label>
        Description <span className="structured-optional">optional</span>
        <textarea
          rows={3}
          value={description}
          maxLength={2000}
          onChange={(event) => setDescription(event.target.value)}
          disabled={pending}
        />
      </label>
      <details
        className="structured-extra-fields"
        open={!!(initial?.manufacturer || initial?.model || initial?.partNumber)}
      >
        <summary>
          Manufacturer and identifiers <span className="structured-optional">optional</span>
        </summary>
        <div className="structured-fields-row">
          <label>
            Manufacturer
            <input
              value={manufacturer}
              maxLength={160}
              onChange={(event) => setManufacturer(event.target.value)}
              disabled={pending}
            />
          </label>
          <label>
            Model
            <input
              value={model}
              maxLength={160}
              onChange={(event) => setModel(event.target.value)}
              disabled={pending}
            />
          </label>
        </div>
        <label>
          Part number
          <input
            value={partNumber}
            maxLength={160}
            onChange={(event) => setPartNumber(event.target.value)}
            disabled={pending}
          />
        </label>
      </details>
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
      <p className="structured-notice">
        {audience === 'public'
          ? 'Public requirements may reference this item and its specifications.'
          : 'Only workspace members can browse this item.'}{' '}
        {initial
          ? 'Published requirement details stay unchanged. Existing drafts apply updates explicitly.'
          : 'Creating the item saves it to your workspace catalog, even if you cancel guide editing.'}
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
        <Button type="button" disabled={pending} onClick={() => void save()}>
          {pending ? 'Saving…' : initial ? 'Save item' : 'Create item'}
        </Button>
      </div>
    </div>
  );
}
export function CatalogDialog({
  workspace,
  initial,
  initialCategoryId,
  initialName,
  trigger,
  onSaved,
}: {
  workspace: StudioWorkspace;
  initial?: CatalogItem;
  initialCategoryId?: string | null;
  initialName?: string;
  trigger: ReactElement;
  onSaved?: (item: CatalogItem) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      trigger={trigger}
      size="wide"
      open={open}
      onOpenChange={setOpen}
      title={initial ? 'Edit catalog item' : 'Create catalog item'}
      description={
        initial
          ? 'Update a shared item. Published requirements retain their saved details.'
          : 'Create a reusable tool, consumable or replacement part.'
      }
    >
      {open && (
        <CatalogForm
          workspace={workspace}
          initial={initial}
          initialCategoryId={initialCategoryId}
          initialName={initialName}
          onSaved={(item) => {
            setOpen(false);
            onSaved?.(item);
          }}
          onCancel={() => setOpen(false)}
        />
      )}
    </Dialog>
  );
}
