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

export const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium',
    'transition-[color,background-color,box-shadow] disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
    focusRing,
  ),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
          'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-sm px-3',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export type ButtonStyleProps = VariantProps<typeof buttonVariants>;
