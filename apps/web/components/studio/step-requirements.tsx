'use client';
import { useState } from 'react';
import type { CatalogItem, StudioWorkspace } from '@guide/contracts';
import {
  getRequirementIssues,
  type GuideDocumentV5,
  type GuideRequirement,
  type StepRequirementUsage,
} from '@guide/content';
import { Dialog } from '@guide/ui';
import { CheckCircle2, Plus, Trash2, Wrench } from 'lucide-react';
import { CatalogPicker } from '../structured';
import { RequirementQuantity, requirementFromCatalog } from './guide-requirements';
import './step-requirements.css';

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
    <div className="step-authoring-context">
      <section
        className="step-requirements"
        aria-labelledby={`step-requirements-heading-${step.id}`}
      >
        <div className="step-context-heading">
          <Wrench size={17} aria-hidden="true" />
          <h2 id={`step-requirements-heading-${step.id}`}>Needed for this step</h2>
          <span>{step.requirements.length}</span>
        </div>
        <p>
          Assign items from preparation, or add one from the catalog. Quantities here allocate the
          guide’s confirmed total.
        </p>
        {step.requirements.map((usage) => {
          const requirement = document.requirements.find(
            (entry) => entry.id === usage.requirementId,
          );
          if (!requirement)
            return (
              <div className="requirements-feedback" key={usage.requirementId}>
                This item was removed from preparation.
                <button
                  type="button"
                  className="button button--secondary"
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
            <article className="step-requirement-card" key={requirement.id}>
              <div className="requirement-card-header">
                <div>
                  <h3>{requirement.name}</h3>
                  {requirement.specification && <p>{requirement.specification}</p>}
                </div>
                {usedElsewhere ? (
                  <button
                    type="button"
                    className="icon-button"
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
                        className="icon-button"
                        aria-label={`Remove ${requirement.name} from this step`}
                        disabled={disabled}
                      >
                        <Trash2 size={16} />
                      </button>
                    }
                    title="Keep this item in preparation?"
                    description={`${requirement.name} is not assigned to any other step. You can keep it for preparation before or after the procedure, or remove it from this guide.`}
                  >
                    <div className="requirements-add-actions">
                      <button
                        type="button"
                        className="button button--primary"
                        onClick={() => removeUsage(requirement.id)}
                      >
                        Remove from step, keep in preparation
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        onClick={() => removeUsage(requirement.id, true)}
                      >
                        Remove from guide too
                      </button>
                    </div>
                  </Dialog>
                )}
              </div>
              <RequirementQuantity
                label={`${requirement.name} in this step`}
                quantity={usage.quantity}
                unit={usage.unit}
                role={requirement.role}
                disabled={disabled}
                onChange={(changes) => patchUsage(requirement.id, changes)}
              />
              {requirement.role === 'use' ? (
                <label className="step-usage-mode">
                  How it is used
                  <select
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
                  <small>
                    {usage.mode === 'consume'
                      ? 'Exact quantities add to the guide’s allocation. The preparation total stays yours to confirm.'
                      : 'Reusing an existing part does not add to the consumption total.'}
                  </small>
                </label>
              ) : (
                <p className="step-usage-explanation">
                  Reusable tool · using it again in another step does not increase the guide total.
                </p>
              )}
              <label className="requirement-checkbox">
                <input
                  type="checkbox"
                  checked={usage.optional}
                  disabled={disabled}
                  onChange={(event) =>
                    patchUsage(requirement.id, { optional: event.target.checked })
                  }
                />
                Optional in this step
              </label>
              <label className="requirement-notes-label">
                Step-specific notes
                <textarea
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
          <div className="step-add-existing">
            <label>
              From guide preparation
              <select
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
              className="button button--secondary"
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
        className="step-preconditions-editor"
        aria-labelledby={`step-preconditions-heading-${step.id}`}
      >
        <div className="step-context-heading">
          <CheckCircle2 size={17} aria-hidden="true" />
          <h2 id={`step-preconditions-heading-${step.id}`}>Before this step</h2>
        </div>
        <p>
          Tell the reader what must already be ready. These are instructions, not completion
          records.
        </p>
        {step.preconditions.map((condition) => (
          <div className="precondition-edit-row" key={condition.id}>
            <div>
              <label>
                Precondition
                <textarea
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
              <label>
                Emphasis
                <select
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
              className="icon-button"
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
          className="button button--secondary"
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
        <div className="earlier-steps-picker">
          <h3>Earlier steps to complete</h3>
          {index === 0 && step.earlierStepIds.length === 0 ? (
            <p>This is the first step; there are no earlier steps to select.</p>
          ) : (
            <>
              {document.steps.slice(0, index).map((earlier, earlierIndex) => (
                <label className="requirement-checkbox" key={earlier.id}>
                  <input
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
                    <div className="requirements-feedback" key={id}>
                      <p>
                        {moved
                          ? `“${moved.title}” is now after this step. Move it earlier or remove the dependency.`
                          : 'A prerequisite step was deleted. Remove or replace this dependency.'}
                      </p>
                      <button
                        className="button button--secondary"
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
        <div className="requirements-feedback" role="status">
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
