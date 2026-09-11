import type { TerminalSession } from '@midnite/studio-shared';
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
import { useTerminalStore } from './terminal-store';

function stubSession(id: string): TerminalSession {
  return { id, kind: 'shell', cwd: '/repo', repoId: 'r1', createdAt: 1 } as TerminalSession;
}

/** Seeds `terminal-store` so the forget-effect's global known-ids check (below) sees these ids as open. */
function seedKnownSessions(ids: readonly string[]): void {
  useTerminalStore.setState({ sessions: ids.map(stubSession) });
}

afterEach(() => {
  resetSessionViewHistoryForTests();
  useTerminalStore.setState({ sessions: [], activeId: null, states: {}, pendingInput: {} });
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
    seedKnownSessions(ids);
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

  it('a session nobody has switched to yet stays mounted — restored sessions all start "just opened", not "long hidden"', () => {
    // 'b' has never been individually visited in this render's lifetime (no
    // `markVisible` ever ran for it) — the same shape a reload's restored
    // session list is in. It must not read as "hidden" just for existing:
    // e2e's "a reload keeps live sessions live" restores two live sessions
    // and expects both to get a live xterm, not only whichever one happens
    // to be visible first.
    const ids = ['a', 'b'];
    seedKnownSessions(ids);
    const { result, rerender } = renderHook(
      ({ visibleId }: { visibleId: string }) =>
        useMountedSessionIds(ids, visibleId, { keepRecent: 3, disposeAfterMs: 1000 }),
      { initialProps: { visibleId: 'a' } },
    );

    expect(result.current).toEqual(new Set(['a', 'b']));

    act(() => rerender({ visibleId: 'b' })); // 'a' goes hidden now, for real this time

    expect(result.current).toEqual(new Set(['a', 'b']));
    expect(useSessionViewHistory.getState().hiddenSince['a']).toBeDefined();
  });

  it("scopes the recency walk to the caller's own ids — an unrelated, more-recent session elsewhere in the shared history never fills this host's slot", () => {
    // A different host (the panel) made 'z' the most-recently-active session
    // process-wide; a card whose own domain is only {'a'} must never let that
    // displace or stand in for its own single slot.
    seedKnownSessions(['z', 'a']);
    const panel = renderHook(
      ({ visibleId }: { visibleId: string | null }) => useMountedSessionIds(['z'], visibleId, { keepRecent: 3 }),
      { initialProps: { visibleId: 'z' as string | null } },
    );
    act(() => panel.rerender({ visibleId: null })); // 'z' goes hidden, most-recent process-wide

    const card = renderHook(
      ({ visibleId }: { visibleId: string | null }) =>
        useMountedSessionIds(['a'], visibleId, { keepRecent: 1, disposeAfterMs: 1000 }),
      { initialProps: { visibleId: 'a' as string | null } },
    );
    act(() => card.rerender({ visibleId: null })); // 'a' goes hidden too

    // Only 'a' is ever in the card's own reported set — never 'z'.
    expect(card.result.current.has('z')).toBe(false);
    expect(card.result.current.has('a')).toBe(true);
  });

  it("one host's own known-ids list cannot forget another host's still-open session from the shared history", () => {
    // Both 'panelSession' (the docked panel's) and 'cardSession' (a Kanban
    // card's) are genuinely open, but a caller only ever passes ITS OWN ids —
    // the forget-effect must check against terminal-store's full session
    // list, not the narrow list this particular render passed in.
    seedKnownSessions(['panelSession', 'cardSession']);
    useSessionViewHistory.setState({ recentOrder: ['cardSession'], hiddenSince: {} });

    // The panel calls the hook knowing only about its own session — never
    // 'cardSession' — which must not make it forget the card's bookkeeping.
    renderHook(() => useMountedSessionIds(['panelSession'], 'panelSession'));

    expect(useSessionViewHistory.getState().recentOrder).toContain('cardSession');
  });

  it('forgets a session once terminal-store no longer knows about it anywhere', () => {
    seedKnownSessions([]); // closed everywhere
    useSessionViewHistory.setState({ recentOrder: ['gone'], hiddenSince: { gone: 0 } });

    renderHook(() => useMountedSessionIds(['gone'], null));

    expect(useSessionViewHistory.getState().recentOrder).not.toContain('gone');
  });
});
