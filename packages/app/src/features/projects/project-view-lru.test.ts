import { describe, expect, it } from 'vitest';

import { touchProjectView } from './project-view-lru';

describe('touchProjectView', () => {
  it('inserts a new entry', () => {
    expect(touchProjectView({}, 'p1', 'a')).toEqual({ p1: 'a' });
  });

  it('updates an existing entry in place, without evicting anything below the cap', () => {
    const map = { p1: 'old', p2: 'b' };
    expect(touchProjectView(map, 'p1', 'new', 5)).toEqual({ p1: 'new', p2: 'b' });
  });

  it('moves a re-touched entry to most-recently-used, so it is not the next eviction', () => {
    const map = { p1: 'a', p2: 'b', p3: 'c' };
    const touched = touchProjectView(map, 'p1', 'a-again', 3);
    // p1 touched last, so p2 is now the oldest.
    const evicted = touchProjectView(touched, 'p4', 'd', 3);
    expect(Object.keys(evicted)).toEqual(['p3', 'p1', 'p4']);
  });

  it('evicts the oldest entry first once past the cap', () => {
    let map: Record<string, string> = {};
    for (const id of ['p1', 'p2', 'p3']) map = touchProjectView(map, id, id, 2);
    expect(Object.keys(map)).toEqual(['p2', 'p3']);
  });

  it('evicts more than one entry if the cap shrinks below the current size', () => {
    const map = { p1: 'a', p2: 'b', p3: 'c', p4: 'd' };
    expect(Object.keys(touchProjectView(map, 'p5', 'e', 2))).toEqual(['p4', 'p5']);
  });

  it('defaults to PROJECT_VIEW_LRU_CAP when no cap is given', () => {
    expect(Object.keys(touchProjectView({}, 'p1', 'a'))).toEqual(['p1']);
  });
});
