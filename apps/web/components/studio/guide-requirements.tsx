'use client';
import { useCallback, useEffect, useState } from 'react';
import type { CatalogItem, StudioWorkspace } from '@guide/contracts';
import {
  allocatedRequirementQuantity,
  formatRequirementQuantity,
  getRequirementIssues,
  requirementUnits,
  type GuideDocumentV4,
  type GuideRequirement,
  type RequirementUnit,
} from '@guide/content';
import { Dialog } from '@guide/ui';
import { Package, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { CatalogPicker } from '../structured';
import { studioFetch } from './transport';
import './guide-requirements.css';

export function requirementFromCatalog(item: CatalogItem): GuideRequirement {
  return {
    id: crypto.randomUUID(),
    itemId: item.id,
    itemVersion: item.version,
    kind: item.kind,
    name: item.name,
    specification: item.specification,
    description: item.description,
    manufacturer: item.manufacturer,
    model: item.model,
    partNumber: item.partNumber,
    quantity: null,
    unit: item.defaultUnit,
    optional: false,
    notes: '',
  };
}
export function RequirementQuantity({
  quantity,
  unit,
  kind,
  label,
  onChange,
  disabled = false,
}: {
  quantity: number | null;
  unit: RequirementUnit;
  kind: GuideRequirement['kind'];
  label: string;
  onChange: (value: { quantity: number | null; unit: RequirementUnit }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="requirement-quantity">
      <label>
        Amount
        <select
          aria-label={`${label} amount type`}
          value={quantity === null ? 'as-needed' : 'fixed'}
          disabled={disabled}
          onChange={(event) =>
            onChange({ quantity: event.target.value === 'as-needed' ? null : 1, unit })
          }
        >
          <option value="as-needed">As needed</option>
          <option value="fixed">Exact quantity</option>
        </select>
      </label>
      {quantity !== null && (
        <label>
          Quantity
          <input
            aria-label={`${label} quantity`}
            type="number"
            min={kind === 'tool' ? 1 : 0.00000001}
            max={1000000000}
            step={kind === 'tool' ? 1 : 'any'}
            value={quantity || ''}
            disabled={disabled}
            onChange={(event) => onChange({ quantity: Number(event.target.value), unit })}
          />
        </label>
      )}
      <label>
        Unit
        <select
          aria-label={`${label} unit`}
          value={unit}
          disabled={disabled}
          onChange={(event) => onChange({ quantity, unit: event.target.value as RequirementUnit })}
        >
          {requirementUnits
            .filter((value) => kind !== 'tool' || ['each', 'pair'].includes(value))
            .map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
export function GuideRequirements({
  document,
  workspace,
  audience,
  onChange,
  disabled = false,
}: {
  document: GuideDocumentV4;
  workspace: StudioWorkspace;
  audience?: 'public' | 'members';
  onChange: (document: GuideDocumentV4) => void;
  disabled?: boolean;
}) {
  const guideAudience = audience ?? (workspace.audience === 'public' ? 'public' : 'members');
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [catalogState, setCatalogState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState('');
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const data = await studioFetch<{ items: CatalogItem[] }>(
        `/api/studio/${workspace.id}/catalog?includeArchived=true`,
      );
      setItems(data.items);
      setCatalogState('ready');
      setCatalogError('');
    } catch (error) {
      setCatalogState('error');
      setCatalogError(error instanceof Error ? error.message : 'Catalog status is unavailable.');
    }
  }, [workspace.id]);
  useEffect(() => {
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);
  const patch = (id: string, changes: Partial<GuideRequirement>) =>
    onChange({
      ...document,
      requirements: document.requirements.map((entry) =>
        entry.id === id ? { ...entry, ...changes } : entry,
      ),
    });
  function select(item: CatalogItem, legacyId?: string) {
    if (disabled) return;
    setItems((current) => [...current.filter((entry) => entry.id !== item.id), item]);
    const existing = document.requirements.find((entry) => entry.itemId === item.id);
    const legacy = document.unresolvedTools.find((entry) => entry.id === legacyId);
    const selected = existing ?? requirementFromCatalog(item);
    const note =
      legacy && legacy.label !== item.name ? `Original preparation note: ${legacy.label}` : '';
    const combinedNotes =
      existing && note ? [existing.notes, note].filter(Boolean).join('\n') : note;
    if (combinedNotes.length > 2000) {
      setNotice(
        'Shorten the existing item notes before linking this note, so its original wording can be preserved.',
      );
      return;
    }
    onChange({
      ...document,
      requirements: existing
        ? document.requirements.map((entry) =>
            entry.id === existing.id && note ? { ...entry, notes: combinedNotes } : entry,
          )
        : [...document.requirements, { ...selected, notes: note }],
      unresolvedTools: document.unresolvedTools.filter((entry) => entry.id !== legacyId),
    });
    setNotice(
      existing
        ? `${item.name} is already added. Its preparation entry is selected.`
        : `${item.name} added to preparation.`,
    );
    requestAnimationFrame(() => {
      const row = window.document.getElementById(`edit-requirement-${selected.id}`);
      row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      row?.focus();
    });
  }
  function remove(id: string) {
    onChange({
      ...document,
      requirements: document.requirements.filter((entry) => entry.id !== id),
      steps: document.steps.map((step) => ({
        ...step,
        requirements: step.requirements.filter((usage) => usage.requirementId !== id),
      })),
    });
    setNotice('Preparation item removed, including its step assignments.');
  }
  const issues = getRequirementIssues(document).filter((issue) => issue.path[0] === 'requirements');
  return (
    <section className="authoring-requirements" aria-labelledby="guide-requirements-title">
      <div className="requirements-section-heading">
        <div>
          <h2 id="guide-requirements-title">Tools, materials & parts</h2>
          <p>
            Select exact items from your workspace catalog. Set the total to prepare for the whole
            guide.
          </p>
        </div>
        <Wrench size={22} aria-hidden="true" />
      </div>
      <p className="requirements-notice" role="status">
        {notice}
      </p>
      {catalogState === 'error' && (
        <div className="requirements-feedback" role="status">
          <p>{catalogError} Your selected details are preserved.</p>
          <button className="button button--secondary" type="button" onClick={() => void refresh()}>
            <RefreshCw size={14} />
            Retry catalog status
          </button>
        </div>
      )}
      {document.unresolvedTools.length > 0 && (
        <div className="legacy-requirements">
          <h3>Link existing preparation notes</h3>
          <p>
            These original notes are preserved. Select or create a catalog item for each before
            publishing.
          </p>
          {document.unresolvedTools.map((entry) => (
            <div className="legacy-requirement" key={entry.id}>
              <strong>{entry.label}</strong>
              <div>
                <CatalogPicker
                  disabled={disabled}
                  workspace={workspace}
                  label={`Link ${entry.label}`}
                  visibility={guideAudience}
                  onSelect={(item) => select(item, entry.id)}
                />
                <Dialog
                  trigger={
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove original note ${entry.label}`}
                      disabled={disabled}
                    >
                      <Trash2 size={16} />
                    </button>
                  }
                  title="Remove this preparation note?"
                  description={`“${entry.label}” will no longer be listed in this draft.`}
                >
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() =>
                      onChange({
                        ...document,
                        unresolvedTools: document.unresolvedTools.filter(
                          (candidate) => candidate.id !== entry.id,
                        ),
                      })
                    }
                  >
                    Remove note
                  </button>
                </Dialog>
              </div>
            </div>
          ))}
        </div>
      )}
      {(['tool', 'supplies'] as const).map((group) => {
        const selected = document.requirements.filter((entry) =>
          group === 'tool' ? entry.kind === 'tool' : entry.kind !== 'tool',
        );
        const Icon = group === 'tool' ? Wrench : Package;
        return (
          <div className="requirement-group" key={group}>
            <h3>
              <Icon size={17} aria-hidden="true" />
              {group === 'tool' ? 'Tools' : 'Materials & parts'}
              <span>{selected.length}</span>
            </h3>
            {selected.length === 0 && (
              <p className="requirements-empty">
                {group === 'tool'
                  ? 'Add the reusable equipment your reader should have ready.'
                  : 'Add consumables and the exact replacement parts.'}
              </p>
            )}
            {selected.map((entry) => {
              const latest = items.find((item) => item.id === entry.itemId);
              const usedIn = document.steps.flatMap((step, index) =>
                step.requirements.some((usage) => usage.requirementId === entry.id)
                  ? [index + 1]
                  : [],
              );
              const allocated = allocatedRequirementQuantity(document, entry.id);
              return (
                <article
                  className="requirement-card"
                  id={`edit-requirement-${entry.id}`}
                  tabIndex={-1}
                  key={entry.id}
                >
                  <div className="requirement-card-header">
                    <div>
                      <h4>{entry.name}</h4>
                      {entry.specification && <p>{entry.specification}</p>}
                      {[entry.manufacturer, entry.model, entry.partNumber].some(Boolean) && (
                        <small>
                          {[entry.manufacturer, entry.model, entry.partNumber]
                            .filter(Boolean)
                            .join(' · ')}
                        </small>
                      )}
                    </div>
                    <Dialog
                      trigger={
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Remove ${entry.name} from guide`}
                          disabled={disabled}
                        >
                          <Trash2 size={16} />
                        </button>
                      }
                      title={`Remove ${entry.name}?`}
                      description={
                        usedIn.length
                          ? `This also removes its assignments in steps ${usedIn.join(', ')}. Published releases stay unchanged.`
                          : 'This removes the preparation requirement from this draft. Published releases stay unchanged.'
                      }
                    >
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => remove(entry.id)}
                      >
                        Remove from guide
                      </button>
                    </Dialog>
                  </div>
                  {latest?.archived && (
                    <p className="requirements-feedback">
                      Archived in the catalog. Existing selections remain readable; select a
                      replacement if this item is no longer suitable.
                    </p>
                  )}
                  {latest && latest.visibility === 'members' && guideAudience === 'public' && (
                    <p className="requirements-feedback">
                      This catalog item is private. Select a public item before publishing this
                      public guide.
                    </p>
                  )}
                  {catalogState === 'ready' && !latest && (
                    <p className="requirements-feedback">
                      Catalog item unavailable. Your selected details are retained; replace or
                      remove it before publishing.
                    </p>
                  )}
                  {latest && !latest.archived && latest.version !== entry.itemVersion && (
                    <Dialog
                      open={review === entry.id}
                      onOpenChange={(open) => setReview(open ? entry.id : null)}
                      trigger={
                        <button type="button" className="requirement-update" disabled={disabled}>
                          Catalog update available · Review changes
                        </button>
                      }
                      title="Review catalog changes"
                      description="Applying this update changes only this draft’s item details. Your confirmed quantity, unit, notes and published releases stay unchanged."
                    >
                      <div className="requirement-comparison">
                        {(
                          [
                            'name',
                            'specification',
                            'description',
                            'manufacturer',
                            'model',
                            'partNumber',
                          ] as const
                        )
                          .filter((field) => entry[field] !== latest[field])
                          .map((field) => (
                            <div key={field}>
                              <strong>{field === 'partNumber' ? 'Part number' : field}</strong>
                              <p>
                                <span>Selected:</span> {entry[field] || '—'}
                              </p>
                              <p>
                                <span>Latest:</span> {latest[field] || '—'}
                              </p>
                            </div>
                          ))}
                        {latest.defaultUnit !== entry.unit && (
                          <p>
                            Catalog default is now {latest.defaultUnit}; this guide keeps{' '}
                            {entry.unit}. Review quantities separately if you need to change units.
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => {
                          const next = requirementFromCatalog(latest);
                          patch(entry.id, {
                            ...next,
                            id: entry.id,
                            quantity: entry.quantity,
                            unit: entry.unit,
                            optional: entry.optional,
                            notes: entry.notes,
                          });
                          setReview(null);
                        }}
                      >
                        Apply item details to draft
                      </button>
                    </Dialog>
                  )}
                  <RequirementQuantity
                    quantity={entry.quantity}
                    unit={entry.unit}
                    kind={entry.kind}
                    label={entry.name}
                    disabled={disabled}
                    onChange={(next) => patch(entry.id, next)}
                  />
                  <label className="requirement-checkbox">
                    <input
                      type="checkbox"
                      checked={entry.optional}
                      disabled={disabled}
                      onChange={(event) => patch(entry.id, { optional: event.target.checked })}
                    />
                    Optional for this guide
                  </label>
                  <label className="requirement-notes-label">
                    Guide-specific notes
                    <textarea
                      rows={2}
                      maxLength={2000}
                      value={entry.notes}
                      disabled={disabled}
                      placeholder="For example, an equivalent size is suitable."
                      onChange={(event) => patch(entry.id, { notes: event.target.value })}
                    />
                  </label>
                  <div className="requirement-allocation">
                    <span>
                      {usedIn.length
                        ? `Used in steps ${usedIn.join(', ')}`
                        : 'Preparation only · no step assignments yet'}
                    </span>
                    {entry.kind !== 'tool' && allocated > 0 && (
                      <span>
                        {formatRequirementQuantity(allocated, entry.unit)} allocated for consumption
                      </span>
                    )}
                    {entry.kind === 'tool' && usedIn.length > 1 && (
                      <span>Reused between steps · counts are not added together</span>
                    )}
                  </div>
                </article>
              );
            })}
            <div className="requirements-add-actions">
              {group === 'tool' ? (
                <CatalogPicker
                  disabled={disabled}
                  workspace={workspace}
                  kind="tool"
                  label="Add tool"
                  selectedIds={document.requirements.map((entry) => entry.itemId)}
                  visibility={guideAudience}
                  onSelect={(item) => select(item)}
                />
              ) : (
                <>
                  <CatalogPicker
                    disabled={disabled}
                    workspace={workspace}
                    kind="material"
                    label="Add material"
                    selectedIds={document.requirements.map((entry) => entry.itemId)}
                    visibility={guideAudience}
                    onSelect={(item) => select(item)}
                  />
                  <CatalogPicker
                    disabled={disabled}
                    workspace={workspace}
                    kind="part"
                    label="Add part"
                    selectedIds={document.requirements.map((entry) => entry.itemId)}
                    visibility={guideAudience}
                    onSelect={(item) => select(item)}
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
      {issues.length > 0 && (
        <div className="requirements-feedback" role="status">
          <strong>Before publishing</strong>
          <ul>
            {issues.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
