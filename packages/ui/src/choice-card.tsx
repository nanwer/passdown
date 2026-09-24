import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

/** A whole-row target with native radio grouping, arrow keys and form behavior. */
export function ChoiceCard({
  title,
  description,
  icon,
  className,
  ...input
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'title'> & {
  title: string;
  description?: string;
  icon?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'group flex min-w-0 cursor-pointer flex-row items-start gap-3 rounded-xl border border-control bg-canvas p-4 text-start transition-colors hover:bg-panel has-checked:border-action has-checked:bg-info-surface has-focus-visible:ring-2 has-focus-visible:ring-focus has-focus-visible:ring-offset-2 has-disabled:cursor-not-allowed has-disabled:opacity-50',
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel text-muted group-has-checked:bg-canvas group-has-checked:text-action"
        >
          {icon}
        </span>
      )}
      <span className="grid min-w-0 flex-1 gap-1">
        <span className="text-sm leading-5 font-semibold text-ink wrap-anywhere">{title}</span>
        {description && (
          <span className="text-[12px] leading-5 font-normal text-muted wrap-anywhere">
            {description}
          </span>
        )}
      </span>
      <input {...input} type="radio" className="mt-0.5 size-4 shrink-0 accent-action" />
    </label>
  );
}
