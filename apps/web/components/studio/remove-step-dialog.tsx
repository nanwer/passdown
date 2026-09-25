'use client';
import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Dialog } from '@guide/ui';

type StepLink = { id: string; title: string; earlierStepIds?: string[] };

/** Removing prerequisite links is an explicit draft edit, never an error-recovery action. */
export function RemoveStepDialog({
  step,
  steps,
  onRemove,
  onReview,
  focusStep,
}: {
  step: StepLink;
  steps: readonly StepLink[];
  onRemove: () => void;
  onReview: (id: string) => void;
  focusStep: () => void;
}) {
  const [open, setOpen] = useState(false);
  const moved = useRef(false);
  const dependents = steps.filter((item) => item.earlierStepIds?.includes(step.id));
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Remove this step?"
      description="This removes the step from your draft."
      trigger={
        <Button variant="quiet" size="tool" disabled={steps.length <= 1}>
          <Trash2 size={16} />
          Remove
        </Button>
      }
      onCloseAutoFocus={(event) => {
        if (moved.current) {
          event.preventDefault();
          moved.current = false;
          focusStep();
        }
      }}
    >
      <div className="grid gap-5 text-ink">
        <div className="flex items-start gap-3 rounded-lg border border-line bg-sunken p-4">
          <Trash2 size={20} className="mt-0.5 shrink-0 text-error" />
          <div className="min-w-0">
            <p className="m-0 text-xs text-muted">
              Step {steps.findIndex((item) => item.id === step.id) + 1}
            </p>
            <p className="mt-1 mb-0 font-semibold wrap-anywhere">{step.title}</p>
          </div>
        </div>
        {dependents.length > 0 && (
          <div className="grid gap-3">
            <div>
              <p className="m-0 text-sm font-semibold">
                {dependents.length === 1
                  ? '1 step will be updated'
                  : `${dependents.length} steps will be updated`}
              </p>
              <p className="mt-1 mb-0 text-sm text-muted">
                {dependents.length === 1
                  ? 'This step will stay, but will no longer require the step you remove.'
                  : 'These steps will stay, but will no longer require the step you remove.'}
              </p>
            </div>
            <ul className="m-0 grid list-none gap-2 p-0">
              {dependents.map((item) => {
                const number = steps.findIndex((candidate) => candidate.id === item.id) + 1;
                return (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
                  >
                    <span className="min-w-0 text-sm wrap-anywhere">
                      <span className="text-muted">Step {number} · </span>
                      {item.title}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Review step ${number}: ${item.title}`}
                      onClick={() => {
                        moved.current = true;
                        onReview(item.id);
                        setOpen(false);
                      }}
                    >
                      Review
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p className="m-0 text-xs text-muted">
          Published versions won’t change. Save your draft when you’re done editing.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              moved.current = true;
              onRemove();
              setOpen(false);
            }}
          >
            <Trash2 size={16} className="shrink-0" />
            Remove step
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
