import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { buttonVariants, type ButtonStyleProps } from './primitives';
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ButtonStyleProps & {
    loading?: boolean;
    children: ReactNode;
  };
export function Button({
  variant,
  size,
  loading = false,
  children,
  className,
  disabled,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size }), className)}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
