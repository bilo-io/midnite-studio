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
  | { kind: 'review'; id: string; repoId: string; number: number; label: string; url: string };

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
  }
};

/** `null` selects the permanent working-tree tab. */
export type WorkbenchState = {
  tabs: WorkbenchTab[];
  activeTabId: string | null;

  openTab: (tab: NewWorkbenchTab) => void;
  focusTab: (id: string | null) => void;
  closeTab: (id: string) => void;
  /** Drop every tab belonging to a repository — called when one is closed. */
  closeRepoTabs: (repoId: string) => void;
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

  openTab: (tab) =>
    set((state) => {
      const id = tabId(tab);
      const existing = state.tabs.find((open) => open.id === id);
      // Re-opening refreshes the label — a branch can be renamed, a PR retitled
      // — without disturbing the tab's position in the strip.
      const next = existing
        ? state.tabs.map((open) => (open.id === id ? ({ ...tab, id } as WorkbenchTab) : open))
        : [...state.tabs, { ...tab, id } as WorkbenchTab];
      return { tabs: next, activeTabId: id };
    }),

  focusTab: (activeTabId) => set({ activeTabId }),

  closeTab: (id) =>
    set((state) => ({
      tabs: state.tabs.filter((tab) => tab.id !== id),
      activeTabId: nextFocusAfterClose(state.tabs, state.activeTabId, id),
    })),

  closeRepoTabs: (repoId) =>
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.repoId !== repoId);
      const stillOpen = tabs.some((tab) => tab.id === state.activeTabId);
      return { tabs, activeTabId: stillOpen ? state.activeTabId : null };
    }),
}));
