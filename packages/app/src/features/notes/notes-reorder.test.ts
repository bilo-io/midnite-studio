import { describe, expect, it } from 'vitest';

import { spliceVisibleOrder } from './notes-reorder';

describe('spliceVisibleOrder', () => {
  it('is the drag result itself when nothing is filtered out', () => {
    expect(spliceVisibleOrder(['a', 'b', 'c'], ['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('pins hidden notes to the index they already occupied', () => {
    // `b` is a completed note hidden by the filter; `a` and `c` are dragged
    // past each other around it and it must not move.
    expect(spliceVisibleOrder(['a', 'b', 'c'], ['a', 'c'], ['c', 'a'])).toEqual(['c', 'b', 'a']);
  });

  it('leaves the order untouched when the drag was a no-op', () => {
    const full = ['a', 'b', 'c', 'd'];
    expect(spliceVisibleOrder(full, ['a', 'c'], ['a', 'c'])).toEqual(full);
  });

  it('falls back to the existing id when the drag result is short', () => {
    // Defensive: a note removed mid-drag would otherwise splice `undefined`
    // into a list the store then renumbers.
    expect(spliceVisibleOrder(['a', 'b', 'c'], ['a', 'b', 'c'], ['c'])).toEqual(['c', 'b', 'c']);
  });
});
