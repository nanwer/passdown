import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn';

/**
 * The shadcn component vocabulary, styled from this project's own tokens.
 *
 * Every colour here is a token name — bg-primary, text-muted-foreground,
 * border-border — that resolves through tokens.json. So these are shadcn's
 * components and structure, not its palette, and a theme change stays a
 * data change rather than a search through class names.
 */

export const cardStyles = 'rounded-lg border border-border bg-card text-card-foreground';

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(cardStyles, 'p-6', className)} {...props} />;
}

export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('mb-4 grid gap-1', className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-base leading-tight font-semibold', className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

/**
 * A focus ring every control shares.
 *
 * Kept in one constant rather than repeated per component, because a control
 * that quietly loses its focus ring is invisible to review and obvious to
 * anyone navigating by keyboard.
 */
const focusRing =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring';

export const inputStyles = cn(
  'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm',
  'placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
  'transition-[color,box-shadow]',
  focusRing,
);

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputStyles, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(inputStyles, 'pr-8', className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label className={cn('grid gap-1.5 text-sm leading-none font-medium', className)} {...props} />
  );
}

/**
 * What a button looks like, wherever one appears.
 *
 * The look is the one the product already had — the hand-written `.button`
 * rules this replaces — expressed in the project's own tokens, so converting a
 * screen changes how it is built and not how its buttons look. Buttons keep
 * the application's focus outline rather than taking a ring of their own.
 *
 * The base, the colour variants and the sizes never set the same property.
 * That matters because a class string from buttonVariants() is used as it is,
 * without merging: if the base said `border-transparent` and a variant named a
 * border colour, which one won would depend on the order Tailwind emits them.
 */
const filledWhenDisabled =
  'disabled:bg-[var(--gp-semantic-action-disabled-background)] disabled:text-[var(--gp-semantic-action-disabled-foreground)]';
// Switch text and background together: a background-only theme transition
// passes through unreadable intermediate colors even when both themes pass.
export const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-[9px] whitespace-nowrap',
    'border border-solid text-xs leading-normal font-semibold',
    'disabled:cursor-not-allowed forced-colors:border-[CanvasText]',
  ),
  {
    variants: {
      variant: {
        primary: cn(
          'border-transparent bg-[var(--gp-component-button-background)] text-[var(--gp-component-button-foreground)]',
          'hover:bg-[var(--gp-component-button-hover)]',
          filledWhenDisabled,
        ),
        secondary: cn(
          'border-[var(--gp-semantic-border-control)] bg-[var(--gp-semantic-surface-raised)]',
          'hover:bg-[var(--gp-semantic-surface-sunken)]',
          filledWhenDisabled,
        ),
        ghost: cn(
          'border-transparent bg-transparent hover:bg-[var(--gp-semantic-surface-sunken)]',
          filledWhenDisabled,
        ),
        /** Secondary actions that sit in a row, such as a step's move and duplicate. */
        quiet: cn(
          'border-transparent bg-transparent text-[var(--gp-component-editor-muted)]',
          'hover:bg-[var(--gp-semantic-surface-sunken)] disabled:opacity-45',
        ),
      },
      size: {
        default: 'min-h-[42px] rounded-[var(--gp-component-button-radius)] px-4 py-2.5',
        sm: 'min-h-8 rounded-[var(--gp-component-button-radius)] px-3 py-1',
        /** Compact enough for a toolbar, and more so on a phone. */
        tool: 'min-h-8 rounded-[6px] p-2 max-[700px]:p-1.5 max-[700px]:text-[11px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export type ButtonStyleProps = VariantProps<typeof buttonVariants>;

/** A square button holding only an icon, labelled for assistive technology. */
export const iconButton =
  'inline-flex size-10 items-center justify-center rounded-control border border-solid border-transparent bg-transparent hover:bg-sunken';
/** A link that appears only when focused, so a keyboard can jump past the header. */
export const skipLink = 'absolute -top-20 start-5 z-[100] bg-raised p-3 focus:top-3';
/** A quiet text link in the header's utilities. */
export const headerLink = 'text-[13px] text-muted hover:text-ink';
