import { expect, it } from 'vitest';
import { twMerge } from 'tailwind-merge';
import { buttonVariants } from './primitives';

const variants = ['primary', 'secondary', 'ghost', 'quiet'] as const;
const sizes = ['default', 'sm', 'tool'] as const;

it.each(variants.flatMap((variant) => sizes.map((size) => ({ variant, size }))))(
  'a $variant $size button sets each property once',
  ({ variant, size }) => {
    // Links styled as buttons use buttonVariants() as it is, without merging.
    // If two of its classes set the same property, the one that wins is
    // whichever Tailwind happens to emit later — which is how a secondary
    // button once lost its border. Merging must therefore find nothing to drop.
    const classes = buttonVariants({ variant, size }).split(/\s+/).filter(Boolean);
    expect(twMerge(classes.join(' ')).split(/\s+/).sort()).toEqual([...classes].sort());
  },
);
