import { describe, expect, it } from 'vitest';

import { createStatsCache, refDigest, type CacheKey } from './stats-cache';

const key = (over: Partial<CacheKey> = {}): CacheKey => ({
  repoId: 'repo-1',
  window: '90d',
  withChurn: false,
  refDigest: 'digest-a',
  ...over,
});

describe('createStatsCache', () => {
  it('returns what it stored', () => {
    const cache = createStatsCache<string>();
    cache.set(key(), 'value');
    expect(cache.get(key())).toBe('value');
  });

  it('misses when any ref tip moved', () => {
    // The whole reason the digest is in the key: the traversal is --all, so a
    // fetch that moves origin/main changes the answer while HEAD stands still.
    // A HEAD-keyed cache would serve the pre-fetch numbers indefinitely, and
    // they look perfectly plausible — they are simply from before.
    const cache = createStatsCache<string>();
    cache.set(key({ refDigest: 'before-fetch' }), 'stale');
    expect(cache.get(key({ refDigest: 'after-fetch' }))).toBeUndefined();
  });

  it('keeps windows and churn variants apart', () => {
    const cache = createStatsCache<string>();
    cache.set(key({ window: '30d' }), 'thirty');
    cache.set(key({ window: '1y' }), 'year');
    cache.set(key({ withChurn: true }), 'with-churn');
    expect(cache.get(key({ window: '30d' }))).toBe('thirty');
    expect(cache.get(key({ window: '1y' }))).toBe('year');
    expect(cache.get(key({ withChurn: true }))).toBe('with-churn');
    expect(cache.get(key({ window: '90d' }))).toBeUndefined();
  });

  it('expires past the TTL, because refs cannot see a gc or the clock', () => {
    // Ref tips catch commits and fetches. They do not catch `git gc` changing
    // the size figure, or a fresh branch quietly becoming stale.
    let now = 1_000;
    const cache = createStatsCache<string>({ now: () => now, ttlMs: 100 });
    cache.set(key(), 'value');
    now = 1_099;
    expect(cache.get(key())).toBe('value');
    now = 1_101;
    expect(cache.get(key())).toBeUndefined();
  });

  it('drops every window for one repository on invalidate', () => {
    const cache = createStatsCache<string>();
    cache.set(key({ window: '30d' }), 'a');
    cache.set(key({ window: '1y' }), 'b');
    cache.set(key({ repoId: 'repo-2' }), 'other');
    cache.invalidate('repo-1');
    expect(cache.get(key({ window: '30d' }))).toBeUndefined();
    expect(cache.get(key({ window: '1y' }))).toBeUndefined();
    // And leaves everyone else alone.
    expect(cache.get(key({ repoId: 'repo-2' }))).toBe('other');
  });

  it('does not let a repoId prefix collide with a longer one', () => {
    const cache = createStatsCache<string>();
    cache.set(key({ repoId: 'repo-1' }), 'one');
    cache.set(key({ repoId: 'repo-10' }), 'ten');
    cache.invalidate('repo-1');
    expect(cache.get(key({ repoId: 'repo-10' }))).toBe('ten');
  });

  it('evicts the least recently used entry past the bound', () => {
    const cache = createStatsCache<string>({ max: 2 });
    cache.set(key({ refDigest: 'a' }), 'a');
    cache.set(key({ refDigest: 'b' }), 'b');
    // Touching 'a' makes 'b' the coldest.
    expect(cache.get(key({ refDigest: 'a' }))).toBe('a');
    cache.set(key({ refDigest: 'c' }), 'c');
    expect(cache.size).toBe(2);
    expect(cache.get(key({ refDigest: 'b' }))).toBeUndefined();
    expect(cache.get(key({ refDigest: 'a' }))).toBe('a');
  });
});

describe('refDigest', () => {
  it('is stable regardless of the order for-each-ref returned', () => {
    // for-each-ref order is not guaranteed across git versions, and an
    // unstable digest would miss the cache on every single call.
    const a = refDigest([
      { refName: 'refs/heads/main', sha: '1' },
      { refName: 'refs/heads/feat', sha: '2' },
    ]);
    const b = refDigest([
      { refName: 'refs/heads/feat', sha: '2' },
      { refName: 'refs/heads/main', sha: '1' },
    ]);
    expect(a).toBe(b);
  });

  it('changes when a tip moves', () => {
    const before = refDigest([{ refName: 'refs/heads/main', sha: 'aaa' }]);
    const after = refDigest([{ refName: 'refs/heads/main', sha: 'bbb' }]);
    expect(before).not.toBe(after);
  });

  it('changes when a ref appears or disappears', () => {
    const one = refDigest([{ refName: 'refs/heads/main', sha: 'aaa' }]);
    const two = refDigest([
      { refName: 'refs/heads/main', sha: 'aaa' },
      { refName: 'refs/heads/feat', sha: 'bbb' },
    ]);
    expect(one).not.toBe(two);
  });
});
