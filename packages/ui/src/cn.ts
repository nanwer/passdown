import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Join class names, letting a later utility win over an earlier one.
 *
 * Plain concatenation cannot do this: "p-2 p-4" leaves both in the class list
 * and the winner is whichever the stylesheet happens to define last, which is
 * not something a caller can reason about. twMerge resolves it by knowing which
 * utilities occupy the same property, so a variant can be overridden at the
 * call site without !important or a more specific selector.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
