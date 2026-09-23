'use client';
import { useCallback, useEffect, useState } from 'react';
import type { CatalogItem, StudioWorkspace } from '@guide/contracts';
import {
  allocatedRequirementQuantity,
  formatRequirementQuantity,
  getRequirementIssues,
  requirementUnits,
  type GuideDocumentV5,
  type GuideRequirement,
  type RequirementUnit,
} from '@guide/content';
import { Dialog, buttonVariants } from '@guide/ui';
import {
  addActions,
  cardDetail,
  cardHeader,
  cardTitle,
  checkbox,
  checkboxLabel,
  feedback,
  fieldControl,
  fieldLabel,
} from './requirement-styles';
import { Package, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { CatalogPicker } from '../structured';
import { studioFetch } from './transport';

/**
 * Which list you added it to is the answer. That is the whole model: an item
 * is not permanently a tool or a part, and the question only has an answer
 * once a particular guide is doing something with it.
 */
export function requirementFromCatalog(
  item: CatalogItem,
  role: GuideRequirement['role'],
): GuideRequirement {
  return {
    id: crypto.randomUUID(),
    itemId: item.id,
    itemVersion: item.version,
    role,
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
  role,
  label,
  onChange,
  disabled = false,
}: {
  quantity: number | null;
  unit: RequirementUnit;
  role: GuideRequirement['role'];
  label: string;
  onChange: (value: { quantity: number | null; unit: RequirementUnit }) => void;
  disabled?: boolean;
}) {
  return (
    <div className="my-4 grid grid-cols-[minmax(140px,1.5fr)_minmax(75px,1fr)_minmax(70px,1fr)] gap-3 max-[600px]:grid-cols-[1fr_1fr]">
      <label className={`${fieldLabel} max-[600px]:col-[1/-1]`}>
        Amount
        <select
          className={`${fieldControl} min-h-10`}
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
        <label className={fieldLabel}>
          Quantity
          <input
            className={`${fieldControl} min-h-10`}
            aria-label={`${label} quantity`}
            type="number"
            min={role === 'keep' ? 1 : 0.00000001}
            max={1000000000}
            step={role === 'keep' ? 1 : 'any'}
            value={quantity || ''}
            disabled={disabled}
            onChange={(event) => onChange({ quantity: Number(event.target.value), unit })}
          />
        </label>
      )}
      <label className={fieldLabel}>
        Unit
        <select
          className={`${fieldControl} min-h-10`}
          aria-label={`${label} unit`}
          value={unit}
          disabled={disabled}
          onChange={(event) => onChange({ quantity, unit: event.target.value as RequirementUnit })}
        >
          {requirementUnits
            .filter((value) => role !== 'keep' || ['each', 'pair'].includes(value))
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
  document: GuideDocumentV5;
  workspace: StudioWorkspace;
  audience?: 'public' | 'members';
  onChange: (document: GuideDocumentV5) => void;
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
  function select(item: CatalogItem, role: GuideRequirement['role'], legacyId?: string) {
    if (disabled) return;
    setItems((current) => [...current.filter((entry) => entry.id !== item.id), item]);
    const existing = document.requirements.find((entry) => entry.itemId === item.id);
    const legacy = document.unresolvedTools.find((entry) => entry.id === legacyId);
    const selected = existing ?? requirementFromCatalog(item, role);
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
    <section
      className="mt-7 border-t border-solid border-t-line pt-7"
      aria-labelledby="guide-requirements-title"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="guide-requirements-title" className="m-0 text-[21px]">
            Tools, materials & parts
          </h2>
          <p className="mx-0 mt-[7px] mb-4 text-[13px] leading-[1.6]">
            Select exact items from your workspace catalog. Set the total to prepare for the whole
            guide.
          </p>
        </div>
        <Wrench size={22} aria-hidden="true" className="mt-[5px] shrink-0 text-muted" />
      </div>
      <p className="text-[13px] empty:hidden" role="status">
        {notice}
      </p>
      {catalogState === 'error' && (
        <div className={feedback} role="status">
          <p>{catalogError} Your selected details are preserved.</p>
          <button
            className={buttonVariants({ variant: 'secondary' })}
            type="button"
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} />
            Retry catalog status
          </button>
        </div>
      )}
      {document.unresolvedTools.length > 0 && (
        <div className={`${feedback} [&_h3]:m-0 [&_h3]:text-[14px]`}>
          <h3>Link existing preparation notes</h3>
          <p>
            These original notes are preserved. Select or create a catalog item for each before
            publishing.
          </p>
          {document.unresolvedTools.map((entry) => (
            <div
              className="flex items-center justify-between gap-3 py-2.5 max-[600px]:flex-col max-[600px]:items-start"
              key={entry.id}
            >
              <strong>{entry.label}</strong>
              <div className="flex flex-wrap gap-2">
                <CatalogPicker
                  disabled={disabled}
                  workspace={workspace}
                  label={`Link ${entry.label}`}
                  visibility={guideAudience}
                  onSelect={(item) => select(item, 'keep', entry.id)}
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
                    className={buttonVariants()}
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
      {(['keep', 'use'] as const).map((group) => {
        const selected = document.requirements.filter((entry) => entry.role === group);
        const Icon = group === 'keep' ? Wrench : Package;
        return (
          <div className="[&+&]:mt-7" key={group}>
            <h3 className="mt-4 mb-3 flex items-center gap-2 text-[15px]">
              <Icon size={17} aria-hidden="true" />
              {group === 'keep' ? 'What you need to hand' : 'What gets used up'}
              <span className="ms-auto text-[12px] font-medium text-muted">{selected.length}</span>
            </h3>
            {selected.length === 0 && (
              <p className="mx-0 mt-[7px] mb-4 text-[13px] leading-[1.6]">
                {group === 'keep'
                  ? 'Anything the reader still has when they are done — tools, a jig, gloves.'
                  : 'Anything used up or fitted — a screw, an adhesive, a replacement screen.'}
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
                  className="requirement-card my-3 scroll-mt-[120px] scroll-mb-[120px] rounded-[10px] border border-solid border-line bg-panel p-4.5 focus:[outline:2px_solid_var(--gp-semantic-focus-ring)] focus:outline-offset-[3px] max-[600px]:p-3.5"
                  id={`edit-requirement-${entry.id}`}
                  tabIndex={-1}
                  key={entry.id}
                >
                  <div className={cardHeader}>
                    <div>
                      <h4 className={cardTitle}>{entry.name}</h4>
                      {entry.specification && <p className={cardDetail}>{entry.specification}</p>}
                      {[entry.manufacturer, entry.model, entry.partNumber].some(Boolean) && (
                        <small className={cardDetail}>
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
                          className="icon-button shrink-0"
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
                        className={buttonVariants()}
                        onClick={() => remove(entry.id)}
                      >
                        Remove from guide
                      </button>
                    </Dialog>
                  </div>
                  {latest?.archived && (
                    <p className={feedback}>
                      Archived in the catalog. Existing selections remain readable; select a
                      replacement if this item is no longer suitable.
                    </p>
                  )}
                  {latest && latest.visibility === 'members' && guideAudience === 'public' && (
                    <p className={feedback}>
                      This catalog item is private. Select a public item before publishing this
                      public guide.
                    </p>
                  )}
                  {catalogState === 'ready' && !latest && (
                    <p className={feedback}>
                      Catalog item unavailable. Your selected details are retained; replace or
                      remove it before publishing.
                    </p>
                  )}
                  {latest && !latest.archived && latest.version !== entry.itemVersion && (
                    <Dialog
                      open={review === entry.id}
                      onOpenChange={(open) => setReview(open ? entry.id : null)}
                      trigger={
                        <button
                          type="button"
                          className="cursor-pointer border-0 [background:none] px-0 py-2 text-start text-[12px] text-ink underline [font:inherit]"
                          disabled={disabled}
                        >
                          Catalog update available · Review changes
                        </button>
                      }
                      title="Review catalog changes"
                      description="Applying this update changes only this draft’s item details. Your confirmed quantity, unit, notes and published releases stay unchanged."
                    >
                      <div className="[&_p]:text-[13px] [&_p]:wrap-anywhere [&_p]:whitespace-pre-wrap [&_span]:font-[650] [&_strong]:capitalize [&>div]:border-b [&>div]:border-solid [&>div]:border-b-line [&>div]:py-3">
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
                        className={buttonVariants()}
                        onClick={() => {
                          const next = requirementFromCatalog(latest, entry.role);
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
                    role={entry.role}
                    label={entry.name}
                    disabled={disabled}
                    onChange={(next) => patch(entry.id, next)}
                  />
                  <label className={checkboxLabel}>
                    <input
                      className={checkbox}
                      type="checkbox"
                      checked={entry.optional}
                      disabled={disabled}
                      onChange={(event) => patch(entry.id, { optional: event.target.checked })}
                    />
                    Optional for this guide
                  </label>
                  <label>
                    Guide-specific notes
                    <textarea
                      className={fieldControl}
                      rows={2}
                      maxLength={2000}
                      value={entry.notes}
                      disabled={disabled}
                      placeholder="For example, an equivalent size is suitable."
                      onChange={(event) => patch(entry.id, { notes: event.target.value })}
                    />
                  </label>
                  {/* The role is the one thing about a requirement that has no
                      right answer until an author gives one, so it has to be
                      changeable after the fact. Moving it also fixes up the
                      step usages, because a thing you keep is reused. */}
                  <label>
                    Will the reader still have it afterwards?
                    <select
                      value={entry.role}
                      disabled={disabled}
                      onChange={(event) => {
                        const role = event.target.value as GuideRequirement['role'];
                        onChange({
                          ...document,
                          requirements: document.requirements.map((candidate) =>
                            candidate.id === entry.id ? { ...candidate, role } : candidate,
                          ),
                          steps: document.steps.map((step) => ({
                            ...step,
                            requirements: step.requirements.map((usage) =>
                              usage.requirementId === entry.id && role === 'keep'
                                ? { ...usage, mode: 'reuse' as const }
                                : usage,
                            ),
                          })),
                        });
                      }}
                    >
                      <option value="keep">Yes — they keep it</option>
                      <option value="use">No — it is used up or fitted</option>
                    </select>
                  </label>
                  <div className="flex flex-col gap-[5px] pt-3.5 text-[11px] leading-[1.5] text-muted">
                    <span>
                      {usedIn.length
                        ? `Used in steps ${usedIn.join(', ')}`
                        : 'Preparation only · no step assignments yet'}
                    </span>
                    {entry.role === 'use' && allocated > 0 && (
                      <span>
                        {formatRequirementQuantity(allocated, entry.unit)} allocated for consumption
                      </span>
                    )}
                    {entry.role === 'keep' && usedIn.length > 1 && (
                      <span>Reused between steps · counts are not added together</span>
                    )}
                  </div>
                </article>
              );
            })}
            <div className={addActions}>
              {/* One picker per group, because the group is the answer. Three
                  buttons used to ask which permanent kind an item was, which
                  is a question the catalog no longer has an opinion about. */}
              <CatalogPicker
                disabled={disabled}
                workspace={workspace}
                label={group === 'keep' ? 'Add something you keep' : 'Add something you use up'}
                selectedIds={document.requirements.map((entry) => entry.itemId)}
                visibility={guideAudience}
                onSelect={(item) => select(item, group)}
              />
            </div>
          </div>
        );
      })}
      {issues.length > 0 && (
        <div className={feedback} role="status">
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
