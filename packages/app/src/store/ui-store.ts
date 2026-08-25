import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_GRAPH_THEME, type GraphThemeId } from '../features/graph/graph-themes';

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

/** Widths of the graph table's fixed-width columns. */
export type GraphColumns = {
  /** The BRANCH / TAG column, left of the lane gutter. */
  branchTag: number;
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
  branchTag: 180,
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
  branchTag: { min: 100, max: 400 },
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
  /** Which of the four graph styles is drawn. A preference, so it persists. */
  graphTheme: GraphThemeId;
  /** Fully-qualified refs the graph is limited to; empty means every ref. */
  graphRefFilter: string[];
  /** Lowercased author emails to highlight; empty means every author. */
  graphAuthorFilter: string[];
  /**
   * Show the pre-image line-number column in a diff.
   *
   * Off by default: the inspector is a side panel, and two monospace gutters
   * eat width that the code itself needs. On when the user wants to answer
   * "which line is this in HEAD".
   */
  diffShowOldGutter: boolean;

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
  setGraphTheme: (theme: GraphThemeId) => void;
  setGraphRefFilter: (refs: string[]) => void;
  setGraphAuthorFilter: (emails: string[]) => void;
  toggleDiffOldGutter: () => void;
};

/**
 * The slice that reaches localStorage — the return type `partialize` produces
 * and `migrate` must therefore also produce. Named so the two cannot drift.
 */
type PersistedUi = Pick<
  UiState,
  | 'layout'
  | 'graphColumns'
  | 'navMode'
  | 'collapsedNavSections'
  | 'diffShowOldGutter'
  | 'graphTheme'
>;

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
      graphTheme: DEFAULT_GRAPH_THEME,
      graphRefFilter: [],
      graphAuthorFilter: [],
      diffShowOldGutter: false,

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
          graphAuthorFilter: [],
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
      setGraphTheme: (graphTheme) => set({ graphTheme }),
      setGraphRefFilter: (graphRefFilter) => set({ graphRefFilter }),
      setGraphAuthorFilter: (graphAuthorFilter) => set({ graphAuthorFilter }),
      toggleDiffOldGutter: () =>
        set((state) => ({ diffShowOldGutter: !state.diffShowOldGutter })),
    }),
    {
      name: 'midnite-git.ui',
      // 2 — `graphColumns.author` was retired when the avatar took over naming
      // the author, and `branchTag` took its place in the table.
      version: 2,
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
        diffShowOldGutter: state.diffShowOldGutter,
        graphTheme: state.graphTheme,
      }),

      /**
       * v1 → v2: drop the retired `author` column width.
       *
       * Left in place it is harmless data, but the field-wise merge below would
       * resurrect it into a `graphColumns` that no longer has a key for it —
       * and the next person to read the persisted state would find a column
       * that does not exist.
       */
      migrate: (persisted, version) => {
        if (version >= 2) return persisted as PersistedUi;
        const state = (persisted ?? {}) as Record<string, unknown> & {
          graphColumns?: Record<string, number>;
        };
        if (state.graphColumns) {
          const { author: _retired, ...rest } = state.graphColumns;
          state.graphColumns = rest;
        }
        return state as PersistedUi;
      },
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
