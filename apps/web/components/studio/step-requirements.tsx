'use client';
import { useState } from 'react';
import type { CatalogItem, StudioWorkspace } from '@guide/contracts';
import {
  getRequirementIssues,
  type GuideDocumentV5,
  type GuideRequirement,
  type StepRequirementUsage,
} from '@guide/content';
import { Dialog, buttonVariants, iconButton } from '@guide/ui';
import { CheckCircle2, Plus, Trash2, Wrench } from 'lucide-react';
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
  quiet,
} from './requirement-styles';
import { CatalogPicker } from '../structured';
import { RequirementQuantity, requirementFromCatalog } from './guide-requirements';

export function StepRequirements({
  document,
  stepId,
  workspace,
  audience,
  onChange,
  disabled = false,
}: {
  document: GuideDocumentV5;
  stepId: string;
  workspace: StudioWorkspace;
  audience?: 'public' | 'members';
  onChange: (document: GuideDocumentV5) => void;
  disabled?: boolean;
}) {
  const guideAudience = audience ?? (workspace.audience === 'public' ? 'public' : 'members');
  const [removing, setRemoving] = useState<string | null>(null);
  const [selectedRequirement, setSelectedRequirement] = useState('');
  const index = document.steps.findIndex((step) => step.id === stepId);
  const step = document.steps[index];
  if (!step) return null;
  const patch = (changes: Partial<typeof step>) =>
    onChange({
      ...document,
      steps: document.steps.map((entry) =>
        entry.id === stepId ? { ...entry, ...changes } : entry,
      ),
    });
  function add(requirement: GuideRequirement, isNew = false) {
    if (disabled || step!.requirements.some((usage) => usage.requirementId === requirement.id))
      return;
    const usage: StepRequirementUsage = {
      requirementId: requirement.id,
      quantity: null,
      unit: requirement.unit,
      // Something kept is reused by definition; something used up starts as
      // consumed, and a step that puts it back can say so.
      mode: requirement.role === 'keep' ? 'reuse' : 'consume',
      optional: requirement.optional,
      notes: '',
    };
    onChange({
      ...document,
      requirements: isNew ? [...document.requirements, requirement] : document.requirements,
      steps: document.steps.map((entry) =>
        entry.id === stepId ? { ...entry, requirements: [...entry.requirements, usage] } : entry,
      ),
    });
    setSelectedRequirement('');
  }
  function fromCatalog(item: CatalogItem, role: GuideRequirement['role']) {
    const existing = document.requirements.find((entry) => entry.itemId === item.id);
    add(existing ?? requirementFromCatalog(item, role), !existing);
  }
  function patchUsage(id: string, changes: Partial<StepRequirementUsage>) {
    patch({
      requirements: step!.requirements.map((usage) =>
        usage.requirementId === id ? { ...usage, ...changes } : usage,
      ),
    });
  }
  function removeUsage(id: string, removePreparation = false) {
    onChange({
      ...document,
      requirements: removePreparation
        ? document.requirements.filter((entry) => entry.id !== id)
        : document.requirements,
      steps: document.steps.map((entry) =>
        entry.id === stepId || removePreparation
          ? {
              ...entry,
              requirements: entry.requirements.filter((usage) => usage.requirementId !== id),
            }
          : entry,
      ),
    });
    setRemoving(null);
  }
  const available = document.requirements.filter(
    (entry) => !step.requirements.some((usage) => usage.requirementId === entry.id),
  );
  const issues = getRequirementIssues(document).filter(
    (issue) => issue.path[0] === 'steps' && issue.path[1] === index,
  );
  return (
    <div className="my-7 grid gap-6">
      <section
        className="step-requirements rounded-[10px] border border-solid border-line bg-panel p-5 max-[600px]:p-[15px]"
        aria-labelledby={`step-requirements-heading-${step.id}`}
      >
        <div className="flex items-center gap-2">
          <Wrench size={17} aria-hidden="true" />
          <h2 id={`step-requirements-heading-${step.id}`} className="m-0 text-[15px]">
            Needed for this step
          </h2>
          <span className="ms-auto text-[12px] text-muted">{step.requirements.length}</span>
        </div>
        <p className="mt-2 mb-4.5 text-[13px] leading-[1.6]">
          Assign items from preparation, or add one from the catalog. Quantities here allocate the
          guide’s confirmed total.
        </p>
        {step.requirements.map((usage) => {
          const requirement = document.requirements.find(
            (entry) => entry.id === usage.requirementId,
          );
          if (!requirement)
            return (
              <div className={feedback} key={usage.requirementId}>
                This item was removed from preparation.
                <button
                  type="button"
                  className={buttonVariants({ variant: 'secondary' })}
                  onClick={() => removeUsage(usage.requirementId)}
                  disabled={disabled}
                >
                  Remove missing item
                </button>
              </div>
            );
          const usedElsewhere = document.steps.some(
            (candidate) =>
              candidate.id !== stepId &&
              candidate.requirements.some((entry) => entry.requirementId === requirement.id),
          );
          return (
            <article
              className="my-5 border-t border-solid border-t-line pt-4.5"
              key={requirement.id}
            >
              <div className={cardHeader}>
                <div>
                  <h3 className={cardTitle}>{requirement.name}</h3>
                  {requirement.specification && (
                    <p className={cardDetail}>{requirement.specification}</p>
                  )}
                </div>
                {usedElsewhere ? (
                  <button
                    type="button"
                    className={`${iconButton} shrink-0`}
                    aria-label={`Remove ${requirement.name} from this step`}
                    onClick={() => removeUsage(requirement.id)}
                    disabled={disabled}
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <Dialog
                    open={removing === requirement.id}
                    onOpenChange={(open) => setRemoving(open ? requirement.id : null)}
                    trigger={
                      <button
                        type="button"
                        className={`${iconButton} shrink-0`}
                        aria-label={`Remove ${requirement.name} from this step`}
                        disabled={disabled}
                      >
                        <Trash2 size={16} />
                      </button>
                    }
                    title="Keep this item in preparation?"
                    description={`${requirement.name} is not assigned to any other step. You can keep it for preparation before or after the procedure, or remove it from this guide.`}
                  >
                    <div className={addActions}>
                      <button
                        type="button"
                        className={buttonVariants()}
                        onClick={() => removeUsage(requirement.id)}
                      >
                        Remove from step, keep in preparation
                      </button>
                      <button
                        type="button"
                        className={buttonVariants({ variant: 'secondary' })}
                        onClick={() => removeUsage(requirement.id, true)}
                      >
                        Remove from guide too
                      </button>
                    </div>
                  </Dialog>
                )}
              </div>
              <div className="my-4">
                <RequirementQuantity
                  label={`${requirement.name} in this step`}
                  quantity={usage.quantity}
                  unit={usage.unit}
                  role={requirement.role}
                  disabled={disabled}
                  onChange={(changes) => patchUsage(requirement.id, changes)}
                />
              </div>
              {requirement.role === 'use' ? (
                <label>
                  How it is used
                  <select
                    className={fieldControl}
                    aria-label={`${requirement.name} usage`}
                    value={usage.mode}
                    disabled={disabled}
                    onChange={(event) =>
                      patchUsage(requirement.id, {
                        mode: event.target.value as StepRequirementUsage['mode'],
                      })
                    }
                  >
                    <option value="consume">Use new material / part</option>
                    <option value="reuse">Reuse the same material / part</option>
                  </select>
                  <small className={quiet}>
                    {usage.mode === 'consume'
                      ? 'Exact quantities add to the guide’s allocation. The preparation total stays yours to confirm.'
                      : 'Reusing an existing part does not add to the consumption total.'}
                  </small>
                </label>
              ) : (
                <p className={quiet}>
                  Reusable tool · using it again in another step does not increase the guide total.
                </p>
              )}
              <label className={checkboxLabel}>
                <input
                  className={checkbox}
                  type="checkbox"
                  checked={usage.optional}
                  disabled={disabled}
                  onChange={(event) =>
                    patchUsage(requirement.id, { optional: event.target.checked })
                  }
                />
                Optional in this step
              </label>
              <label>
                Step-specific notes
                <textarea
                  className={fieldControl}
                  rows={2}
                  maxLength={2000}
                  value={usage.notes}
                  disabled={disabled}
                  onChange={(event) => patchUsage(requirement.id, { notes: event.target.value })}
                  placeholder="Where or how this item is used in this step."
                />
              </label>
            </article>
          );
        })}
        {available.length > 0 && (
          <div className="my-4 flex items-end gap-2.5 max-[600px]:flex-col max-[600px]:items-stretch">
            <label className={`${fieldLabel} flex-1`}>
              From guide preparation
              <select
                className={fieldControl}
                aria-label="Choose preparation item for this step"
                value={selectedRequirement}
                disabled={disabled}
                onChange={(event) => setSelectedRequirement(event.target.value)}
              >
                <option value="">Choose an item…</option>
                {available.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                    {entry.specification ? ` — ${entry.specification}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={buttonVariants({ variant: 'secondary' })}
              disabled={!selectedRequirement || disabled}
              onClick={() => {
                const requirement = available.find((entry) => entry.id === selectedRequirement);
                if (requirement) add(requirement);
              }}
            >
              <Plus size={15} />
              Assign to step
            </button>
          </div>
        )}
        <CatalogPicker
          disabled={disabled}
          workspace={workspace}
          label="Add from catalog"
          selectedIds={step.requirements.flatMap((usage) => {
            const entry = document.requirements.find(
              (candidate) => candidate.id === usage.requirementId,
            );
            return entry ? [entry.itemId] : [];
          })}
          visibility={guideAudience}
          // Added straight onto a step, so it is something used up unless the
          // author says otherwise in the preparation list.
          onSelect={(item) => fromCatalog(item, 'use')}
        />
      </section>
      <section
        className="rounded-[10px] border border-solid border-line bg-panel p-5 max-[600px]:p-[15px]"
        aria-labelledby={`step-preconditions-heading-${step.id}`}
      >
        <div className="flex items-center gap-2">
          <CheckCircle2 size={17} aria-hidden="true" />
          <h2 id={`step-preconditions-heading-${step.id}`} className="m-0 text-[15px]">
            Before this step
          </h2>
        </div>
        <p className="mt-2 mb-4.5 text-[13px] leading-[1.6]">
          Tell the reader what must already be ready. These are instructions, not completion
          records.
        </p>
        {step.preconditions.map((condition) => (
          <div className="my-4 flex items-start gap-2.5" key={condition.id}>
            <div className="grid flex-1 grid-cols-[1fr_140px] gap-3 max-[600px]:grid-cols-[1fr]">
              <label className={fieldLabel}>
                Precondition
                <textarea
                  className={fieldControl}
                  aria-label="Precondition instruction"
                  rows={2}
                  maxLength={2000}
                  value={condition.text}
                  disabled={disabled}
                  onChange={(event) =>
                    patch({
                      preconditions: step.preconditions.map((entry) =>
                        entry.id === condition.id ? { ...entry, text: event.target.value } : entry,
                      ),
                    })
                  }
                  placeholder="For example, clear and dry the work surface."
                />
              </label>
              <label className={fieldLabel}>
                Emphasis
                <select
                  className={fieldControl}
                  value={condition.tone}
                  disabled={disabled}
                  aria-label="Precondition emphasis"
                  onChange={(event) =>
                    patch({
                      preconditions: step.preconditions.map((entry) =>
                        entry.id === condition.id
                          ? { ...entry, tone: event.target.value as 'info' | 'warning' }
                          : entry,
                      ),
                    })
                  }
                >
                  <option value="info">Information</option>
                  <option value="warning">Warning</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              className={`${iconButton} mt-5 shrink-0`}
              aria-label="Remove precondition"
              disabled={disabled}
              onClick={() =>
                patch({
                  preconditions: step.preconditions.filter((entry) => entry.id !== condition.id),
                })
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className={buttonVariants({ variant: 'secondary' })}
          disabled={disabled || step.preconditions.length >= 20}
          onClick={() =>
            patch({
              preconditions: [
                ...step.preconditions,
                { id: crypto.randomUUID(), text: '', tone: 'info' },
              ],
            })
          }
        >
          <Plus size={15} />
          Add precondition
        </button>
        <div className="mt-5.5 border-t border-solid border-t-line pt-4.5">
          <h3 className="mt-0 mb-2.5 text-[13px]">Earlier steps to complete</h3>
          {index === 0 && step.earlierStepIds.length === 0 ? (
            <p className="text-[12px]">
              This is the first step; there are no earlier steps to select.
            </p>
          ) : (
            <>
              {document.steps.slice(0, index).map((earlier, earlierIndex) => (
                <label className={checkboxLabel} key={earlier.id}>
                  <input
                    className={checkbox}
                    type="checkbox"
                    checked={step.earlierStepIds.includes(earlier.id)}
                    disabled={disabled}
                    onChange={(event) =>
                      patch({
                        earlierStepIds: event.target.checked
                          ? [...step.earlierStepIds, earlier.id]
                          : step.earlierStepIds.filter((id) => id !== earlier.id),
                      })
                    }
                  />
                  Step {earlierIndex + 1}: {earlier.title}
                </label>
              ))}
              {step.earlierStepIds
                .filter((id) => !document.steps.slice(0, index).some((entry) => entry.id === id))
                .map((id) => {
                  const moved = document.steps.find((entry) => entry.id === id);
                  return (
                    <div className={feedback} key={id}>
                      <p>
                        {moved
                          ? `“${moved.title}” is now after this step. Move it earlier or remove the dependency.`
                          : 'A prerequisite step was deleted. Remove or replace this dependency.'}
                      </p>
                      <button
                        className={buttonVariants({ variant: 'secondary' })}
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          patch({
                            earlierStepIds: step.earlierStepIds.filter((entry) => entry !== id),
                          })
                        }
                      >
                        Remove invalid prerequisite
                      </button>
                    </div>
                  );
                })}
            </>
          )}
        </div>
      </section>
      {issues.length > 0 && (
        <div className={feedback} role="status">
          <strong>Before publishing this step</strong>
          <ul>
            {issues.map((issue, issueIndex) => (
              <li key={issueIndex}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
