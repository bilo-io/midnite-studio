import { useEffect, useRef } from 'react';
import { create } from 'zustand';

import { useNow } from '../../lib/use-now';
import { useTerminalStore } from './terminal-store';

/**
 * Which hidden terminal sessions stay mounted, and for how long (Phase 84
 * Theme E).
 *
 * Every open session used to stay mounted forever — `terminal-panel.tsx`
 * stacked each one `absolute inset-0` and only ever added to the pile, since
 * nothing disposed a hidden xterm. This is the pure half of the fix: given
 * which session is visible right now, the order sessions were last looked
 * at, and how long each hidden one has been out of view, decide which ones
 * still deserve a live xterm.
 *
 * The rule has two independent caps, both of which must pass:
 *   1. **Recency** — the visible session plus the `keepRecent` most-recently-
 *      viewed hidden ones (default 3) are eligible at all; everything
 *      further back is dropped outright, however recently it went hidden.
 *   2. **Idle time** — even a session inside that top-N recency window is
 *      dropped once it has been hidden for `disposeAfterMs` (default 2 min).
 *      A session switched away from seconds ago should not vanish just
 *      because a 4th and 5th session got clicked through in between; one
 *      that has sat hidden for two minutes should, even if nothing else has
 *      displaced it.
 *
 * Kept pure and tested directly, the same shape as `xterm-budget.ts`'s
 * `grantedWebglKeys` — the store below is the untested wiring around it.
 */

export const DEFAULT_KEEP_RECENT_SESSIONS = 3;
export const DEFAULT_SESSION_DISPOSE_AFTER_MS = 2 * 60 * 1000;

export type SessionMountPolicyInput = {
  /** The session currently on screen, or `null` if nothing is. Always kept. */
  visibleId: string | null;
  /** Every other known session id, most-recently-active first. */
  recentOrder: readonly string[];
  /** `Date.now()` at the moment each id stopped being visible; absent = never has been (just opened). */
  hiddenSince: Readonly<Record<string, number>>;
  now: number;
  /** How many hidden sessions besides the visible one stay mounted. */
  keepRecent?: number;
  /** How long a hidden session may stay mounted before it is disposed regardless of recency. */
  disposeAfterMs?: number;
};

/**
 * The set of session ids that should keep a live, mounted xterm right now.
 *
 * `recentOrder` is walked in order, filling up to `keepRecent` slots and
 * skipping (not stopping at) any entry that has already aged past
 * `disposeAfterMs` — so a stale 3rd-most-recent session yields its slot to
 * the 4th rather than shrinking the mounted set below its cap.
 */
export function mountedSessionIds(input: SessionMountPolicyInput): Set<string> {
  const {
    visibleId,
    recentOrder,
    hiddenSince,
    now,
    keepRecent = DEFAULT_KEEP_RECENT_SESSIONS,
    disposeAfterMs = DEFAULT_SESSION_DISPOSE_AFTER_MS,
  } = input;

  const mounted = new Set<string>();
  if (visibleId !== null) mounted.add(visibleId);

  for (const id of recentOrder) {
    if (id === visibleId) continue;
    if (mounted.size - (visibleId !== null ? 1 : 0) >= keepRecent) break;
    const since = hiddenSince[id];
    const idleMs = since === undefined ? 0 : now - since;
    if (idleMs < disposeAfterMs) mounted.add(id);
  }

  return mounted;
}

// --- the untested wiring: view-history bookkeeping, shared process-wide ----
//
// One store per renderer process, exactly like `xterm-budget.ts` — the docked
// panel and a detached Terminal window are two separate renderer processes
// (each with its own module instance). Within one process, though, the panel
// is no longer the only caller (Phase 84 Theme E.5): a Kanban card terminal
// consults this same policy, and its session id lives in the SAME shared
// `recentOrder`/`hiddenSince` maps the panel's sessions do — there is only one
// history per process, not one per host, because a session switching from a
// card to the panel (`revealSession`) must carry its recency forward rather
// than starting a second, disconnected history under a different key.
//
// That sharing is exactly why `useMountedSessionIds` below scopes its own
// `recentOrder` walk to the CALLER's own `sessionIds` before handing it to
// `mountedSessionIds` — a card passing its one id must never have a totally
// unrelated panel session (more recently active, process-wide) fill its own
// single recency slot — while the separate "forget a closed session"
// bookkeeping is scoped to every session `terminal-store` still knows about,
// process-wide, so one host's own narrow id list can never garbage-collect a
// bookmark another host is still relying on.

type ViewHistoryState = {
  /** Most-recently-active first; deduplicated. */
  recentOrder: string[];
  hiddenSince: Record<string, number>;
  markVisible: (id: string) => void;
  markHidden: (id: string, at: number) => void;
  /** Drops bookkeeping for a session that no longer exists (closed). */
  forget: (id: string) => void;
};

export const useSessionViewHistory = create<ViewHistoryState>()((set) => ({
  recentOrder: [],
  hiddenSince: {},
  markVisible: (id) =>
    set((state) => {
      if (!(id in state.hiddenSince) && state.recentOrder[0] === id) return state;
      const hiddenSince = { ...state.hiddenSince };
      delete hiddenSince[id];
      return { recentOrder: [id, ...state.recentOrder.filter((x) => x !== id)], hiddenSince };
    }),
  markHidden: (id, at) =>
    set((state) => {
      if (state.hiddenSince[id] !== undefined) return state;
      return { hiddenSince: { ...state.hiddenSince, [id]: at } };
    }),
  forget: (id) =>
    set((state) => {
      if (!state.recentOrder.includes(id) && !(id in state.hiddenSince)) return state;
      const hiddenSince = { ...state.hiddenSince };
      delete hiddenSince[id];
      return { recentOrder: state.recentOrder.filter((x) => x !== id), hiddenSince };
    }),
}));

/**
 * The set of session ids `terminal-panel.tsx` (and any other host consulting
 * the same policy — Theme E.5, e.g. `card-terminal.tsx`) should render a live
 * xterm for right now.
 *
 * `sessionIds` is every session the CALLER's own host knows about — a Kanban
 * card passes its one session id, the panel passes its whole `inMainPanel`
 * list. Two jobs, not one: it scopes the shared `recentOrder` down to this
 * host's own ids before the recency/idle calculation runs (so a card's single
 * slot is never displaced by some unrelated, more-recently-active panel
 * session sharing the same process-wide history — see the module doc above),
 * and it seeds the id set the forget-effect checks a session against — but
 * that check is widened to every session `terminal-store` still knows about
 * app-wide, not just this caller's own list, so a card forgetting its one
 * session's bookkeeping the moment IT closes can never also erase a still-open
 * panel session's history it never knew about in the first place.
 *
 * Re-evaluates once a second via `useNow()` (a shared, visibility-gated timer
 * — see its own doc) so the `disposeAfterMs` cutoff is caught even when
 * nothing else changes in between.
 */
export function useMountedSessionIds(
  sessionIds: readonly string[],
  visibleId: string | null,
  options?: { keepRecent?: number; disposeAfterMs?: number },
): Set<string> {
  const recentOrder = useSessionViewHistory((s) => s.recentOrder);
  const hiddenSince = useSessionViewHistory((s) => s.hiddenSince);
  const markVisible = useSessionViewHistory((s) => s.markVisible);
  const markHidden = useSessionViewHistory((s) => s.markHidden);
  const forget = useSessionViewHistory((s) => s.forget);
  const now = useNow().getTime();

  useEffect(() => {
    if (visibleId !== null) markVisible(visibleId);
  }, [visibleId, markVisible]);

  const previousVisible = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousVisible.current;
    if (previous !== null && previous !== visibleId) markHidden(previous, Date.now());
    previousVisible.current = visibleId;
  }, [visibleId, markHidden]);

  useEffect(() => {
    // Every session ANY host still has open, process-wide — not just this
    // caller's own `sessionIds` — so this effect only ever forgets a session
    // that has genuinely closed everywhere, never one a different host (the
    // panel, another card) is still tracking.
    const known = new Set(useTerminalStore.getState().sessions.map((s) => s.id));
    for (const id of recentOrder) if (!known.has(id)) forget(id);
  }, [sessionIds, recentOrder, forget]);

  // This caller's own slice of the shared history: an id neither visible now
  // nor known to THIS host's `sessionIds` has nothing to do with its budget.
  const knownHere = new Set(sessionIds);
  const scopedRecentOrder = recentOrder.filter((id) => knownHere.has(id));

  return mountedSessionIds({
    visibleId,
    recentOrder: scopedRecentOrder,
    hiddenSince,
    now,
    ...options,
  });
}

/** Test-only: reset the shared view-history store between specs. */
export function resetSessionViewHistoryForTests(): void {
  useSessionViewHistory.setState({ recentOrder: [], hiddenSince: {} });
}
