import { create } from 'zustand';

/**
 * The tabs open in the content area.
 *
 * A deliberate second store rather than a slice of `ui-store`: everything in
 * that store is either window geometry or a single selection, and all of it is
 * a candidate for persistence. These are not. A tab names a repository, a
 * checkout, a workflow run — every one of which can be gone by the next launch,
 * and a restored tab pointing at a closed repo is a broken tab rather than a
 * restored one. Keeping them apart means nobody has to remember to exclude them
 * from `partialize`.
 *
 * The first tab is not modelled here at all. The Changes view always has a
 * working-tree tab, it always follows the sidebar's current selection, and it
 * cannot be closed — so it is a property of the view, not a row in this list.
 */

/** What a tab shows. Each arm carries exactly what its body needs to render. */
export type WorkbenchTab =
  | { kind: 'all-changes'; id: string; repoId: string; worktreePath: string; label: string }
  | { kind: 'run'; id: string; repoId: string; runId: string; label: string; url: string }
  | { kind: 'review'; id: string; repoId: string; number: number; label: string; url: string }
  | { kind: 'commit'; id: string; repoId: string; sha: string; label: string; worktreePath?: string }
  // Phase 61 Theme G. Deliberately no `repoId` — a database connection is not
  // repo-scoped (Decision 7) — which is why `closeRepoTabs` and
  // `use-prune-closed-repos.ts` both had to learn to skip this kind rather
  // than reading a field it does not carry.
  | { kind: 'query'; id: string; connectionId: string; label: string; sql: string };

export type WorkbenchTabKind = WorkbenchTab['kind'];

/**
 * A tab before it has an id.
 *
 * `Omit<WorkbenchTab, 'id'>` would be wrong here and quietly so: `Omit` over a
 * union keeps only the keys every arm shares, so it would erase `worktreePath`,
 * `runId` and `number` — the very fields identity is derived from. Distributing
 * over the arms first keeps each one intact.
 */
export type NewWorkbenchTab = WorkbenchTab extends infer T
  ? T extends WorkbenchTab
    ? Omit<T, 'id'>
    : never
  : never;

/**
 * A tab's identity, derived from what it points at rather than generated.
 *
 * This is what makes "open" mean "focus it if it is already open". A random id
 * would stack a second identical diff of the same checkout every time the
 * button was clicked, which is the behaviour every editor with tabs has
 * decided against.
 */
export const tabId = (tab: NewWorkbenchTab): string => {
  switch (tab.kind) {
    case 'all-changes':
      return `all-changes:${tab.repoId}:${tab.worktreePath}`;
    case 'run':
      return `run:${tab.repoId}:${tab.runId}`;
    case 'review':
      return `review:${tab.repoId}:${tab.number}`;
    case 'commit':
      return `commit:${tab.repoId}:${tab.sha}`;
    case 'query':
      // connectionId + label, not sql: reopening the same preview (same
      // connection, same table label) refocuses it rather than stacking a
      // duplicate, exactly like every other kind here. A "new" query tab
      // gets a fresh label (`Query 1`, `Query 2`, …) at the call site
      // (`use-database-tabs.ts`) specifically so it never collides with an
      // existing one — see "two query tabs on one connection stay
      // independent" in the phase doc's Verification section.
      return `query:${tab.connectionId}:${tab.label}`;
  }
};


/** `null` selects the permanent working-tree tab. */
export type WorkbenchState = {
  tabs: WorkbenchTab[];
  activeTabId: string | null;
  /**
   * The Database view's own active tab (Phase 61 Theme G, Decision 7).
   *
   * The store stays single and unscoped — there is no vanilla-zustand
   * precedent in this repo, and two callers
   * (`use-graph-actions.ts`, `use-prune-closed-repos.ts`) reach it from
   * outside the `Workbench` React tree, which a view-scoped store could not
   * serve. Instead the Database view's `<TabStrip>` filters the same `tabs`
   * array down to `kind === 'query'` and tracks its own cursor here, while
   * Changes' strip filters to everything else and keeps using `activeTabId`.
   */
  activeQueryTabId: string | null;
  /**
   * Query tab ids whose `sql` has changed since it was last run — the "you
   * have edited the statement since these results" signal `TabStrip`'s dirty
   * dot renders (Theme G). Not persistence-dirty (there is nothing to save in
   * this phase, see "Not in this phase") — just "the results on screen may no
   * longer match what's in the editor".
   */
  dirtyQueryTabIds: ReadonlySet<string>;

  openTab: (tab: NewWorkbenchTab) => void;
  focusTab: (id: string | null) => void;
  closeTab: (id: string) => void;
  /** Drop every tab belonging to a repository — called when one is closed. */
  closeRepoTabs: (repoId: string) => void;
  /** Edits a query tab's SQL (the editor's `onChange`) and marks it dirty. */
  updateQueryTabSql: (id: string, sql: string) => void;
  /** Clears the dirty flag — called once a run actually starts. */
  markQueryTabClean: (id: string) => void;
};

/**
 * Which tab takes focus once `id` goes away.
 *
 * The neighbour to the left, falling back to the working-tree tab. Jumping to
 * the start of the strip on every close is what makes closing three tabs in a
 * row feel like the app is fighting you.
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
  activeTabId: null,
  activeQueryTabId: null,
  dirtyQueryTabIds: new Set<string>(),

  openTab: (tab) =>
    set((state) => {
      const id = tabId(tab);
      const existing = state.tabs.find((open) => open.id === id);
      // Re-opening refreshes the label — a branch can be renamed, a PR retitled
      // — without disturbing the tab's position in the strip.
      const next = existing
        ? state.tabs.map((open) => (open.id === id ? ({ ...tab, id } as WorkbenchTab) : open))
        : [...state.tabs, { ...tab, id } as WorkbenchTab];
      // Query tabs get their own cursor (Decision 7) — opening one must not
      // steal focus away from whatever the Changes strip has active, and
      // vice versa.
      return tab.kind === 'query'
        ? { tabs: next, activeQueryTabId: id }
        : { tabs: next, activeTabId: id };
    }),

  focusTab: (id) =>
    set((state) => {
      // `null` is only ever the Changes view's permanent working-tree tab —
      // Database has no equivalent "no tab" affordance to focus.
      if (id === null) return { activeTabId: null };
      const tab = state.tabs.find((t) => t.id === id);
      return tab?.kind === 'query' ? { activeQueryTabId: id } : { activeTabId: id };
    }),

  closeTab: (id) =>
    set((state) => {
      const closing = state.tabs.find((t) => t.id === id);
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      // Next focus is computed within the SAME kind-filtered subset the
      // closed tab belonged to — the two strips do not compete for a shared
      // "what comes after" cursor.
      if (closing?.kind === 'query') {
        const queryTabs = state.tabs.filter((tab) => tab.kind === 'query');
        return { tabs, activeQueryTabId: nextFocusAfterClose(queryTabs, state.activeQueryTabId, id) };
      }
      const otherTabs = state.tabs.filter((tab) => tab.kind !== 'query');
      return { tabs, activeTabId: nextFocusAfterClose(otherTabs, state.activeTabId, id) };
    }),

  closeRepoTabs: (repoId) =>
    set((state) => {
      // Query tabs carry no `repoId` at all — they survive every repo close,
      // by design (Decision 7): a database connection outlives the repo that
      // happened to be open when it was made.
      const tabs = state.tabs.filter((tab) => tab.kind === 'query' || tab.repoId !== repoId);
      const stillOpen = tabs.some((tab) => tab.id === state.activeTabId);
      return { tabs, activeTabId: stillOpen ? state.activeTabId : null };
    }),

  updateQueryTabSql: (id, sql) =>
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.id === id && tab.kind === 'query' ? { ...tab, sql } : tab)),
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
