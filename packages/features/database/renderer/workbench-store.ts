import { create } from 'zustand';

/**
 * The Database view's query tabs (Phase 61 Theme G).
 *
 * A deliberate second store rather than a slice of `ui-store`: everything in
 * that store is either window geometry or a single selection, and all of it is
 * a candidate for persistence. These are not — a tab names a connection that
 * can be gone by the next launch, and keeping them apart means nobody has to
 * remember to exclude them from `partialize`.
 *
 * This store used to carry the Changes view's workbench tabs too
 * (all-changes, run, review, commit). That view is gone — its contents live
 * in the git graph's inline panels, which already show a checkout's whole
 * diff and any commit's details in place — so only query tabs remain.
 */

/** What a tab shows. Deliberately no `repoId` — a database connection is not repo-scoped (Decision 7). */
export type WorkbenchTab = { kind: 'query'; id: string; connectionId: string; label: string; sql: string };

export type WorkbenchTabKind = WorkbenchTab['kind'];

/** A tab before it has an id. */
export type NewWorkbenchTab = Omit<WorkbenchTab, 'id'>;

/**
 * A tab's identity, derived from what it points at rather than generated.
 *
 * connectionId + label, not sql: reopening the same preview (same
 * connection, same table label) refocuses it rather than stacking a
 * duplicate. A "new" query tab gets a fresh label (`Query 1`, `Query 2`, …)
 * at the call site (`use-database-tabs.ts`) specifically so it never collides
 * with an existing one.
 */
export const tabId = (tab: NewWorkbenchTab): string => `query:${tab.connectionId}:${tab.label}`;

export type WorkbenchState = {
  tabs: WorkbenchTab[];
  /** The Database view's active tab. */
  activeQueryTabId: string | null;
  /**
   * Query tab ids whose `sql` has changed since it was last run — the "you
   * have edited the statement since these results" signal `TabStrip`'s dirty
   * dot renders (Theme G). Not persistence-dirty — just "the results on screen
   * may no longer match what's in the editor".
   */
  dirtyQueryTabIds: ReadonlySet<string>;

  openTab: (tab: NewWorkbenchTab) => void;
  focusTab: (id: string | null) => void;
  closeTab: (id: string) => void;
  /** Edits a query tab's SQL (the editor's `onChange`) and marks it dirty. */
  updateQueryTabSql: (id: string, sql: string) => void;
  /** Clears the dirty flag — called once a run actually starts. */
  markQueryTabClean: (id: string) => void;
};

/**
 * Which tab takes focus once `id` goes away.
 *
 * The neighbour to the left, falling back to none. Jumping to the start of the
 * strip on every close is what makes closing three tabs in a row feel like the
 * app is fighting you.
 */
export function nextFocusAfterClose(
  tabs: readonly WorkbenchTab[],
  activeTabId: string | null,
  closingId: string,
): string | null {
  if (activeTabId !== closingId) return activeTabId;
  const index = tabs.findIndex((tab) => tab.id === closingId);
  if (index <= 0) return null;
  return tabs[index - 1]?.id ?? null;
}

export const useWorkbenchStore = create<WorkbenchState>()((set) => ({
  tabs: [],
  activeQueryTabId: null,
  dirtyQueryTabIds: new Set<string>(),

  openTab: (tab) =>
    set((state) => {
      const id = tabId(tab);
      const existing = state.tabs.find((open) => open.id === id);
      // Re-opening refreshes the label without disturbing the tab's position.
      const next = existing
        ? state.tabs.map((open) => (open.id === id ? { ...tab, id } : open))
        : [...state.tabs, { ...tab, id }];
      return { tabs: next, activeQueryTabId: id };
    }),

  focusTab: (activeQueryTabId) => set({ activeQueryTabId }),

  closeTab: (id) =>
    set((state) => ({
      tabs: state.tabs.filter((tab) => tab.id !== id),
      activeQueryTabId: nextFocusAfterClose(state.tabs, state.activeQueryTabId, id),
    })),

  updateQueryTabSql: (id, sql) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, sql } : tab)),
      dirtyQueryTabIds: new Set(state.dirtyQueryTabIds).add(id),
    })),

  markQueryTabClean: (id) =>
    set((state) => {
      if (!state.dirtyQueryTabIds.has(id)) return {};
      const next = new Set(state.dirtyQueryTabIds);
      next.delete(id);
      return { dirtyQueryTabIds: next };
    }),
}));
