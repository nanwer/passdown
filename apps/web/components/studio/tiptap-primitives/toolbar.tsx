'use client';

// Adapted from Tiptap UI Components (MIT). See THIRD_PARTY_NOTICES.md.
import { useEffect, useRef, type HTMLAttributes } from 'react';
import { cn } from '@guide/ui';
import { toolbarClass, toolbarGroupClass } from '../rich-text-styles';

/** Tiptap-style grouped toolbar with a single tab stop and arrow-key navigation. */
export function Toolbar({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const toolbar = ref.current;
    if (!toolbar) return;
    const synchronize = () => {
      const buttons = [...toolbar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const active =
        buttons.find((button) => button === document.activeElement) ??
        buttons.find((button) => button.tabIndex === 0) ??
        buttons[0];
      toolbar.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        button.tabIndex = button === active ? 0 : -1;
      });
    };
    synchronize();
    const observer = new MutationObserver(synchronize);
    observer.observe(toolbar, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled'],
    });
    toolbar.addEventListener('focusin', synchronize);
    return () => {
      observer.disconnect();
      toolbar.removeEventListener('focusin', synchronize);
    };
  }, []);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Format instructions"
      className={cn(toolbarClass, className)}
      {...props}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
        )
          return;
        const buttons = [
          ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        ];
        const current = buttons.indexOf(event.target as HTMLButtonElement);
        if (current < 0 || buttons.length === 0) return;
        event.preventDefault();
        const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
        const forward = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (current + (forward ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}
    >
      {children}
    </div>
  );
}

export function ToolbarGroup({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="group" className={cn(toolbarGroupClass, className)} {...props}>
      {children}
    </div>
  );
}
