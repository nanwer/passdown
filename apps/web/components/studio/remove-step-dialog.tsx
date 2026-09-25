'use client';
import { useRef, useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
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
      description={`“${step.title}” will be removed from this draft. The published release stays unchanged until you publish again.`}
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
        {dependents.length > 0 && (
          <div className="grid gap-3 rounded-lg border border-warning-line bg-warning-surface p-4 text-warning">
            <p className="m-0 font-semibold">Other steps depend on this one</p>
            <p className="m-0 text-sm">
              Removing it also removes its prerequisite links from the steps below. Review them
              first if this changes the order or safety of the work.
            </p>
            <ul className="m-0 grid list-none gap-2 p-0">
              {dependents.map((item) => {
                const number = steps.findIndex((candidate) => candidate.id === item.id) + 1;
                return (
                  <li key={item.id}>
                    <Button
                      variant="secondary"
                      className="h-auto w-full justify-between whitespace-normal text-left"
                      aria-label={`Review step ${number}: ${item.title}`}
                      onClick={() => {
                        moved.current = true;
                        onReview(item.id);
                        setOpen(false);
                      }}
                    >
                      <span>
                        Step {number}: {item.title}
                      </span>
                      <ArrowRight size={16} className="shrink-0" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <p className="m-0 text-sm text-muted">
          Save the draft to keep this change. Cancel keeps the step and all its links.
        </p>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            className="whitespace-normal"
            onClick={() => {
              moved.current = true;
              onRemove();
              setOpen(false);
            }}
          >
            <Trash2 size={16} className="shrink-0" />
            {dependents.length ? 'Remove step and prerequisite links' : 'Remove step'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
