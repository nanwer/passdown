import { describe, expect, it } from 'vitest';
import { moveBy } from './model';

describe('moving an item within a list', () => {
  it('swaps with its neighbour and refuses to move past either end', () => {
    const items = ['a', 'b', 'c'];
    expect(moveBy(items, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveBy(items, 2, -1)).toEqual(['a', 'c', 'b']);
    // At the ends there is nothing to swap with, so the list is returned as it
    // was rather than silently dropping or duplicating an entry.
    expect(moveBy(items, 0, -1)).toEqual(items);
    expect(moveBy(items, 2, 1)).toEqual(items);
    expect(moveBy(items, -1, 1)).toEqual(items);
    expect(moveBy(items, 9, -1)).toEqual(items);
    // The original is never mutated.
    expect(items).toEqual(['a', 'b', 'c']);
  });
});
