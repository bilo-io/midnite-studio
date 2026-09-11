import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import type { ViewId } from '../store/ui-store';
import { useNow } from '../lib/use-now';
import { VIEW_COMPONENT, type ViewEntry } from './view-registry';

/**
 * Bounded keep-alive for heavy views (Phase 84 Theme G).
 *
 * `app.tsx` used to unmount a view outright the moment `activeView` moved off
 * it (`<div key={activeView}>`), with one deliberate exception: a maximized
 * terminal hides the current view with `display:none` rather than tearing it
 * down, because re-streaming 50 000 graph rows just to make room for a
 * full-screen shell would be wasted work the moment the terminal restores.
 * This generalises that exact trade to ordinary view switching, for the two
 * views (Graph, Changes — `view-registry.tsx`'s `keepAlive` field) expensive
 * enough to earn it: leaving one keeps it mounted, hidden, for up to its own
 * `ttlMs`, so a return within that window is instant.
 *
 * Kept pure and tested directly, the same shape as `xterm-budget.ts`'s
 * `grantedWebglKeys` and `session-mount-policy.ts`'s `mountedSessionIds` — the
 * store below is the untested wiring around it.
 */

export type KeptView = { viewId: ViewId; hiddenSince: number };

function keepAliveFor(viewId: ViewId): ViewEntry['keepAlive'] {
  return VIEW_COMPONENT[viewId].keepAlive;
}

/**
 * What the single kept-alive slot should hold right after `activeView` moves
 * away from `previousView`.
 *
 * At most one entry, ever (G.4) — a view left behind REPLACES whatever was
 * already kept rather than joining it, which is what makes "cycling three
 * views never holds two hidden" true regardless of order. Returning to the
 * view that is currently kept clears the slot outright: it is on screen
 * again, not hidden, so there is nothing left to bound.
 */
export function nextKeptView(params: {
  activeView: ViewId;
  /** The view `activeView` just moved away from; `null` on first mount. */
  previousView: ViewId | null;
  current: KeptView | null;
  now: number;
}): KeptView | null {
  const { activeView, previousView, current, now } = params;

  if (previousView === null || previousView === activeView) {
    return current;
  }

  if (current !== null && current.viewId === activeView) {
    // Returning to the view that is currently kept: it is on screen again,
    // not hidden, so there is nothing left for the slot to hold.
    return null;
  }

  if (keepAliveFor(previousView)) {
    return { viewId: previousView, hiddenSince: now };
  }

  // Left a view with no keep-alive config (Files, Actions, …): whatever was
  // already kept from an earlier switch is untouched by this one.
  return current;
}

/** Has the kept-alive entry aged out — by TTL, or (G.3) a row-count ceiling? */
export function isKeptViewStale(params: {
  current: KeptView | null;
  now: number;
  rowCount?: number;
}): boolean {
  const { current, now, rowCount } = params;
  if (current === null) return false;

  const config = keepAliveFor(current.viewId);
  if (!config) return true; // a config removed out from under a live entry

  if (config.maxRows !== undefined && rowCount !== undefined && rowCount > config.maxRows) {
    return true;
  }
  return now - current.hiddenSince >= config.ttlMs;
}

type KeptViewStoreState = {
  kept: KeptView | null;
  setKept: (kept: KeptView | null) => void;
};

/** One store per renderer process — same reasoning as `xterm-budget.ts`'s. */
const useKeptViewStore = create<KeptViewStoreState>()((set) => ({
  kept: null,
  setKept: (kept) => set({ kept }),
}));

/**
 * Tracks the single last-left keep-alive-eligible view. Mounted once, in
 * `app.tsx`, beside `activeView` — every render of the view box reads its
 * return value to decide what (if anything) stays mounted hidden beside the
 * active view.
 */
export function useKeptAliveView(activeView: ViewId): KeptView | null {
  const kept = useKeptViewStore((s) => s.kept);
  const setKept = useKeptViewStore((s) => s.setKept);
  const previousRef = useRef<ViewId | null>(null);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = activeView;
    if (previous === activeView) return;
    setKept(
      nextKeptView({
        activeView,
        previousView: previous,
        current: useKeptViewStore.getState().kept,
        now: Date.now(),
      }),
    );
  }, [activeView, setKept]);

  // TTL eviction: re-checked once a second, the same cadence every other
  // `useNow()` consumer shares — a no-op render whenever nothing is kept.
  const now = useNow().getTime();
  useEffect(() => {
    const current = useKeptViewStore.getState().kept;
    if (current !== null && isKeptViewStale({ current, now })) setKept(null);
  }, [now, setKept]);

  return kept;
}

/**
 * A kept-alive view's own row-count ceiling (G.3), called by the view itself
 * from inside its hidden mount — `view-keep-alive.ts` has no visibility into
 * a specific view's data, so the view reports its own count and this decides
 * whether that crosses its configured `maxRows`.
 *
 * A no-op unless `viewId` is actually the kept entry right now, so an active
 * (visible) view's own row count — normal, expected to grow — never evicts
 * anything.
 */
export function evictKeptViewIfOverRows(viewId: ViewId, rowCount: number): void {
  const state = useKeptViewStore.getState();
  if (state.kept?.viewId !== viewId) return;
  if (isKeptViewStale({ current: state.kept, now: Date.now(), rowCount })) {
    state.setKept(null);
  }
}

/** Test-only: reset the shared store between specs. */
export function resetKeptViewForTests(): void {
  useKeptViewStore.setState({ kept: null });
}
