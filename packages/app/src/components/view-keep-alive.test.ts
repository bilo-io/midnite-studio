import { describe, expect, it } from 'vitest';

import { isKeptViewStale, nextKeptView } from './view-keep-alive';

describe('nextKeptView', () => {
  it('keeps nothing on first mount', () => {
    expect(nextKeptView({ activeView: 'graph', previousView: null, current: null, now: 0 })).toBeNull();
  });

  it('holds the previous view when it opts into keep-alive', () => {
    const result = nextKeptView({
      activeView: 'files',
      previousView: 'graph',
      current: null,
      now: 1000,
    });
    expect(result).toEqual({ viewId: 'graph', hiddenSince: 1000 });
  });

  it('leaves the kept view untouched when the newly-left view has no keep-alive config', () => {
    const current = { viewId: 'graph', hiddenSince: 1000 } as const;
    const result = nextKeptView({
      activeView: 'actions',
      previousView: 'files',
      current,
      now: 2000,
    });
    expect(result).toBe(current);
  });

  it('replaces whatever was kept — at most one, ever (G.4)', () => {
    const current = { viewId: 'graph', hiddenSince: 1000 } as const;
    const result = nextKeptView({
      activeView: 'files',
      previousView: 'changes',
      current,
      now: 3000,
    });
    expect(result).toEqual({ viewId: 'changes', hiddenSince: 3000 });
  });

  it('clears the slot when returning to the kept view itself', () => {
    const current = { viewId: 'graph', hiddenSince: 1000 } as const;
    const result = nextKeptView({
      activeView: 'graph',
      previousView: 'files',
      current,
      now: 4000,
    });
    expect(result).toBeNull();
  });

  it('is a no-op when the active view has not changed', () => {
    const current = { viewId: 'graph', hiddenSince: 1000 } as const;
    const result = nextKeptView({
      activeView: 'files',
      previousView: 'files',
      current,
      now: 5000,
    });
    expect(result).toBe(current);
  });
});

describe('isKeptViewStale', () => {
  it('is never stale with nothing kept', () => {
    expect(isKeptViewStale({ current: null, now: 0 })).toBe(false);
  });

  it('is not stale inside the TTL', () => {
    const current = { viewId: 'graph', hiddenSince: 0 } as const;
    // graph's configured ttlMs is 5 minutes.
    expect(isKeptViewStale({ current, now: 60_000 })).toBe(false);
  });

  it('is stale once the TTL elapses', () => {
    const current = { viewId: 'graph', hiddenSince: 0 } as const;
    expect(isKeptViewStale({ current, now: 5 * 60 * 1000 })).toBe(true);
  });

  it('changes has no row ceiling, so a row count never makes it stale early', () => {
    const current = { viewId: 'changes', hiddenSince: 0 } as const;
    expect(isKeptViewStale({ current, now: 1000, rowCount: 999_999 })).toBe(false);
  });

  it('is stale immediately once the graph row ceiling is crossed, TTL notwithstanding', () => {
    const current = { viewId: 'graph', hiddenSince: 0 } as const;
    expect(isKeptViewStale({ current, now: 1000, rowCount: 20_001 })).toBe(true);
  });

  it('is not stale under the row ceiling even with a huge count close to it', () => {
    const current = { viewId: 'graph', hiddenSince: 0 } as const;
    expect(isKeptViewStale({ current, now: 1000, rowCount: 20_000 })).toBe(false);
  });
});
