import { describe, expect, it } from 'vitest';

import { Lru } from './lru';

describe('Lru (Phase 139 Theme B)', () => {
  it('evicts the least recently used key over capacity', () => {
    const lru = new Lru<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    lru.set('c', 3);
    expect(lru.keys()).toEqual(['b', 'c']);
  });

  it('a read makes a key fresh', () => {
    const lru = new Lru<string, number>(2);
    lru.set('a', 1);
    lru.set('b', 2);
    expect(lru.get('a')).toBe(1);
    lru.set('c', 3);
    expect(lru.keys()).toEqual(['a', 'c']);
  });

  it('a re-set replaces the value without growing', () => {
    const lru = new Lru<string, number>(2);
    lru.set('a', 1);
    lru.set('a', 9);
    expect(lru.size).toBe(1);
    expect(lru.get('a')).toBe(9);
    expect(lru.get('zz')).toBeUndefined();
  });
});
