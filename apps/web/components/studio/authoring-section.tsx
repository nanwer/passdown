import type { ReactNode } from 'react';
import { cn } from '@guide/ui';

export const authoringPanel = 'rounded-2xl border border-control bg-canvas p-6 sm:p-7';

/** Shared hierarchy for creation, draft details and preparation. */
export function AuthoringSection({
  title,
  description,
  icon,
  children,
  className,
  id,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  id: string;
}) {
  return (
    <section className={cn(authoringPanel, className)} aria-labelledby={id}>
      <div className="mb-6 flex items-start gap-3">
        {icon && (
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info-surface text-info"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 id={id} className="m-0 text-[17px] leading-6 font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="mt-1 text-[13px] leading-5 font-normal">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
