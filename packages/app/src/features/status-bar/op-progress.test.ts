import { describe, expect, it } from 'vitest';

import { opLabel } from './op-progress';

describe('opLabel', () => {
  it('renders nothing for no ops in flight', () => {
    expect(opLabel([])).toBeNull();
  });

  it('renders the single op verb', () => {
    expect(opLabel(['fetch'])).toBe('Fetching…');
  });

  it('renders the highest-ranked verb plus a count for the rest', () => {
    // fetch (rank 50) is running alongside a rebase (rank 100) — the rebase
    // must win regardless of array order.
    expect(opLabel(['fetch', 'rebase'])).toBe('Rebasing… +1');
    expect(opLabel(['rebase', 'fetch'])).toBe('Rebasing… +1');
  });

  it('counts every op beyond the top-ranked one', () => {
    expect(opLabel(['stage', 'unstage', 'commit'])).toBe('Staging… +2');
  });
});
