import { describe, expect, it } from 'vitest';

import { summarizeSections } from './sidebar-page';

describe('summarizeSections', () => {
  it('leaves a single admitted child named as itself', () => {
    expect(summarizeSections(['actions'])).toEqual(['actions']);
  });

  it('collapses a fully-admitted parent to its own name', () => {
    expect(summarizeSections(['local', 'remotes'])).toEqual(['branches']);
  });

  it('collapses Forge only once all four children are admitted', () => {
    expect(summarizeSections(['actions', 'reviews', 'issues'])).toEqual([
      'actions',
      'reviews',
      'issues',
    ]);
    expect(summarizeSections(['actions', 'reviews', 'issues', 'tests'])).toEqual(['forge']);
  });

  it('is order-independent on input, order-stable on output', () => {
    expect(summarizeSections(['tests', 'actions', 'reviews', 'issues'])).toEqual(['forge']);
  });

  it('admits a leaf beside an unrelated parent without collapsing either', () => {
    expect(summarizeSections(['worktrees', 'actions'])).toEqual(['worktrees', 'actions']);
  });
});
