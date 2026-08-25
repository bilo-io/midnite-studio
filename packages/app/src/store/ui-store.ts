import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Collapse/expand/lock behaviour of the nav rail, mirroring `AppFrame`'s
 * `navMode` prop.
 *
 * Declared here rather than imported: `@bilo-io/shell` exports the type from
 * its `contracts` module but does not re-export it from the package entry, and
 * its `exports` map exposes only `.` and `./appearance.css` — so there is no
 * legal deep import. Three string literals are a cheap thing to keep in step,
 * and `AppFrame` would reject a drifted value at the type level anyway.
 */
export type NavMode = 'auto' | 'expanded' | 'collapsed';

/** The main content views the rail switches between. */
export type ViewId = 'graph' | 'changes' | 'settings';

/** Pixel sizes of the draggable panes. */
export type LayoutSizes = {
  reposWidth: number;
  terminalHeight: number;
  detailWidth: number;
  changesListWidth: number;
};

/** Widths of the graph table's fixed-width trailing columns. */
export type GraphColumns = {
  author: number;
  date: number;
  sha: number;
};

export const DEFAULT_LAYOUT: LayoutSizes = {
  reposWidth: 256,
  terminalHeight: 288,
  detailWidth: 384,
  changesListWidth: 384,
};

export const DEFAULT_GRAPH_COLUMNS: GraphColumns = {
  author: 160,
  date: 112,
  sha: 64,
};

/** Drag bounds, colocated with the defaults so nothing can clamp to a stale pair. */
export const LAYOUT_BOUNDS = {
  reposWidth: { min: 180, max: 560 },
  terminalHeight: { min: 120, max: 720 },
  detailWidth: { min: 280, max: 720 },
  changesListWidth: { min: 240, max: 720 },
} as const;

export const GRAPH_COLUMN_BOUNDS = {
  author: { min: 80, max: 320 },
  date: { min: 72, max: 240 },
  sha: { min: 56, max: 160 },
} as const;

/**
 * UI state: what's selected, what's open, how the panes are sized.
 *
 * Deliberately separate from TanStack Query (which owns main-process data) and
 * from the graph store (which owns streamed rows): this is the state that
 * belongs to the window, survives no refetch, and is written from event
 * handlers all over the tree.
 *
 * Persisted selectively — see `partialize` below.
 */
export type UiState = {
  activeView: ViewId;
  selectedRepoId: string | null;
  selectedWorktreePath: string | null;
  selectedCommitSha: string | null;
  terminalOpen: boolean;

  layout: LayoutSizes;
  graphColumns: GraphColumns;
  navMode: NavMode;
  collapsedNavSections: string[];
  /** Fully-qualified refs the graph is limited to; empty means every ref. */
  graphRefFilter: string[];

  setActiveView: (view: ViewId) => void;
  selectRepo: (repoId: string | null) => void;
  selectWorktree: (path: string | null) => void;
  selectCommit: (sha: string | null) => void;
  toggleTerminal: () => void;
  setTerminalOpen: (open: boolean) => void;

  setLayout: <K extends keyof LayoutSizes>(key: K, value: number) => void;
  setGraphColumn: <K extends keyof GraphColumns>(key: K, value: number) => void;
  setNavMode: (mode: NavMode) => void;
  toggleNavSection: (key: string) => void;
  setGraphRefFilter: (refs: string[]) => void;
};

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      activeView: 'graph',
      selectedRepoId: null,
      selectedWorktreePath: null,
      selectedCommitSha: null,
      terminalOpen: false,

      layout: DEFAULT_LAYOUT,
      graphColumns: DEFAULT_GRAPH_COLUMNS,
      navMode: 'auto',
      collapsedNavSections: [],
      graphRefFilter: [],

      setActiveView: (activeView) => set({ activeView }),
      // Switching repo invalidates every selection scoped to the old one — the
      // ref filter included: refs are per-repo, so carrying `refs/heads/feat-x`
      // into a repo that has no such branch yields an empty graph that looks
      // like missing history.
      selectRepo: (selectedRepoId) =>
        set({
          selectedRepoId,
          selectedWorktreePath: null,
          selectedCommitSha: null,
          graphRefFilter: [],
        }),
      selectWorktree: (selectedWorktreePath) => set({ selectedWorktreePath }),
      selectCommit: (selectedCommitSha) => set({ selectedCommitSha }),
      toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
      setTerminalOpen: (terminalOpen) => set({ terminalOpen }),

      setLayout: (key, value) => set((state) => ({ layout: { ...state.layout, [key]: value } })),
      setGraphColumn: (key, value) =>
        set((state) => ({ graphColumns: { ...state.graphColumns, [key]: value } })),
      setNavMode: (navMode) => set({ navMode }),
      toggleNavSection: (key) =>
        set((state) => ({
          collapsedNavSections: state.collapsedNavSections.includes(key)
            ? state.collapsedNavSections.filter((k) => k !== key)
            : [...state.collapsedNavSections, key],
        })),
      setGraphRefFilter: (graphRefFilter) => set({ graphRefFilter }),
    }),
    {
      name: 'midnite-git.ui',
      version: 1,
      /**
       * Geometry and chrome preferences persist; everything about *this
       * session* does not.
       *
       * `terminalOpen` is the one that matters: restoring it spawns a login
       * shell before the user has asked for a terminal, and the panel's
       * mount/unmount contract exists precisely so no shell outlives its
       * visible panel. `graphRefFilter` is excluded too — a filter that
       * silently survived a restart would present a truncated history as the
       * whole truth.
       */
      partialize: (state) => ({
        layout: state.layout,
        graphColumns: state.graphColumns,
        navMode: state.navMode,
        collapsedNavSections: state.collapsedNavSections,
      }),
      /**
       * Merge field-by-field over the defaults.
       *
       * zustand's default merge is a shallow spread, so a persisted `layout`
       * written before a new pane existed would replace the whole object and
       * leave that pane's size `undefined` — which reaches the DOM as
       * `width: undefined` and collapses the panel to zero. Re-spreading each
       * nested object means an older payload gains new keys instead.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<UiState>;
        return {
          ...current,
          ...saved,
          layout: { ...current.layout, ...saved.layout },
          graphColumns: { ...current.graphColumns, ...saved.graphColumns },
        };
      },
    },
  ),
);

/** Route path for a view — AppFrame is router-agnostic and compares strings. */
export const pathForView = (view: ViewId): string => `/${view}`;
export const viewForPath = (path: string): ViewId =>
  path === '/changes' ? 'changes' : path === '/settings' ? 'settings' : 'graph';
