import { create } from 'zustand';

/**
 * Which closed session the Sessions view is showing (Phase 67 Theme C).
 *
 * Unpersisted, like `issues-store.ts` — a closed session's id ages out of the
 * fetched history the same way an issue number ages out of its page, and a
 * restored selection would open on "no longer there" more often than not.
 *
 * A single id, **not** `issues-store.ts`'s `ByRepo<T>`: Sessions is
 * `global: true` (Theme E) and its rows are grouped by repo *within one
 * list*, so a per-repo key would be selecting inside a list that is not
 * per-repo. The auto-pick fallback lives in `sessions-view.tsx`
 * (`pickInitialClosedSession`), the way `pickInitialIssue` does for Issues —
 * a store that owns a fallback owns the fetched data too, and this one does
 * not.
 */
export type SessionsState = {
  /** Explicit selection. Absent means "whatever the view auto-selects". */
  selectedClosedSessionId: string | null;
  selectClosedSession: (id: string | null) => void;
};

export const useSessionsStore = create<SessionsState>((set) => ({
  selectedClosedSessionId: null,

  selectClosedSession: (id) => set({ selectedClosedSessionId: id }),
}));
