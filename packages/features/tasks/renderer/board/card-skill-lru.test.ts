import { describe, expect, it } from 'vitest';

import { touchCardSkill } from './card-skill-lru';

describe('touchCardSkill', () => {
  it('inserts a new entry', () => {
    expect(touchCardSkill({}, 'p1:i1', 'execAdhoc')).toEqual({ 'p1:i1': 'execAdhoc' });
  });

  it('updates an existing entry in place, without evicting anything below the cap', () => {
    const map = { 'p1:i1': 'execAdhoc', 'p1:i2': 'brainstorm' };
    expect(touchCardSkill(map, 'p1:i1', 'refine', 5)).toEqual({ 'p1:i1': 'refine', 'p1:i2': 'brainstorm' });
  });

  it('moves a re-touched entry to most-recently-used, so it is not the next eviction', () => {
    const map = { 'p1:i1': 'a', 'p1:i2': 'b', 'p1:i3': 'c' };
    const touched = touchCardSkill(map, 'p1:i1', 'a-again', 3);
    // p1:i1 touched last, so p1:i2 is now the oldest.
    const evicted = touchCardSkill(touched, 'p1:i4', 'd', 3);
    expect(Object.keys(evicted)).toEqual(['p1:i3', 'p1:i1', 'p1:i4']);
  });

  it('evicts the oldest entry first once past the cap', () => {
    let map: Record<string, string> = {};
    for (const id of ['p1:i1', 'p1:i2', 'p1:i3']) map = touchCardSkill(map, id, id, 2);
    expect(Object.keys(map)).toEqual(['p1:i2', 'p1:i3']);
  });

  it('evicts more than one entry if the cap shrinks below the current size', () => {
    const map = { 'p1:i1': 'a', 'p1:i2': 'b', 'p1:i3': 'c', 'p1:i4': 'd' };
    expect(Object.keys(touchCardSkill(map, 'p1:i5', 'e', 2))).toEqual(['p1:i4', 'p1:i5']);
  });

  it('defaults to CARD_SKILL_LRU_CAP when no cap is given', () => {
    expect(Object.keys(touchCardSkill({}, 'p1:i1', 'a'))).toEqual(['p1:i1']);
  });
});
