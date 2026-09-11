import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_KEEP_RECENT_SESSIONS,
  DEFAULT_SESSION_DISPOSE_AFTER_MS,
  mountedSessionIds,
  resetSessionViewHistoryForTests,
  useMountedSessionIds,
  useSessionViewHistory,
} from './session-mount-policy';

afterEach(() => {
  resetSessionViewHistoryForTests();
  vi.useRealTimers();
});

describe('mountedSessionIds', () => {
  it('always keeps the visible session', () => {
    const result = mountedSessionIds({ visibleId: 'a', recentOrder: [], hiddenSince: {}, now: 0 });
    expect(result).toEqual(new Set(['a']));
  });

  it('keeps up to keepRecent hidden sessions besides the visible one', () => {
    const result = mountedSessionIds({
      visibleId: 'a',
      recentOrder: ['b', 'c', 'd', 'e'],
      hiddenSince: {},
      now: 0,
      keepRecent: 3,
    });
    expect(result).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('drops everything past the recency cap regardless of idle time', () => {
    const result = mountedSessionIds({
      visibleId: 'a',
      recentOrder: ['b', 'c', 'd', 'e'],
      hiddenSince: { b: 0, c: 0, d: 0, e: 0 },
      now: 1,
      keepRecent: 2,
    });
    expect(result).toEqual(new Set(['a', 'b', 'c']));
  });

  it('disposes a hidden session past disposeAfterMs even within the recency window', () => {
    const result = mountedSessionIds({
      visibleId: 'a',
      recentOrder: ['b', 'c'],
      hiddenSince: { b: 0 },
      now: 200_000,
      keepRecent: 3,
      disposeAfterMs: 120_000,
    });
    expect(result).toEqual(new Set(['a', 'c']));
  });

  it('lets a later entry fill the slot a stale one vacates', () => {
    const result = mountedSessionIds({
      visibleId: 'a',
      recentOrder: ['b', 'c', 'd'],
      hiddenSince: { b: 0 },
      now: 200_000,
      keepRecent: 2,
      disposeAfterMs: 120_000,
    });
    // b aged out; c and d (both never-hidden, idle 0) fill both remaining slots.
    expect(result).toEqual(new Set(['a', 'c', 'd']));
  });

  it('a session never marked hidden (hiddenSince absent) counts as freshly hidden, not eternally kept', () => {
    const result = mountedSessionIds({
      visibleId: 'a',
      recentOrder: ['b'],
      hiddenSince: {},
      now: 999_999_999,
      disposeAfterMs: 120_000,
    });
    // Absent hiddenSince reads as idle 0 — always inside the window on its own.
    expect(result).toEqual(new Set(['a', 'b']));
  });

  it('handles no visible session at all', () => {
    const result = mountedSessionIds({
      visibleId: null,
      recentOrder: ['a', 'b', 'c', 'd'],
      hiddenSince: {},
      now: 0,
      keepRecent: 2,
    });
    expect(result).toEqual(new Set(['a', 'b']));
  });

  it('defaults match the phase doc (3 recent, 2 minutes)', () => {
    expect(DEFAULT_KEEP_RECENT_SESSIONS).toBe(3);
    expect(DEFAULT_SESSION_DISPOSE_AFTER_MS).toBe(2 * 60 * 1000);
  });
});

describe('useMountedSessionIds', () => {
  it('mounts only the visible session plus keepRecent history, from 10 open sessions', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `s${i}`);
    let visible = ids[0]!;
    const { result, rerender } = renderHook(
      ({ visibleId }: { visibleId: string }) => useMountedSessionIds(ids, visibleId, { keepRecent: 3 }),
      { initialProps: { visibleId: visible } },
    );

    // Click through every session once — each becomes visible in turn.
    for (const id of ids) {
      visible = id;
      act(() => rerender({ visibleId: visible }));
    }

    // Visible one plus 3 most-recent = 4 mounted, out of 10 open sessions.
    expect(result.current.size).toBe(4);
    expect(result.current.has(visible)).toBe(true);
  });

  it('records when a session goes hidden, immediately and independent of the clock tick', () => {
    const ids = ['a', 'b'];
    const { result, rerender } = renderHook(
      ({ visibleId }: { visibleId: string }) =>
        useMountedSessionIds(ids, visibleId, { keepRecent: 3, disposeAfterMs: 1000 }),
      { initialProps: { visibleId: 'a' } },
    );

    expect(result.current).toEqual(new Set(['a']));

    act(() => rerender({ visibleId: 'b' })); // 'a' goes hidden now

    expect(result.current).toEqual(new Set(['a', 'b']));
    expect(useSessionViewHistory.getState().hiddenSince['a']).toBeDefined();
  });
});
