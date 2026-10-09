import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { StatsWindow } from '@midnite/studio-shared';

import {
  AGENTS_LAYOUT,
  DEFAULT_LAYOUT,
  FINANCE_LAYOUT,
  NEW_DASHBOARD_LAYOUT,
  WIDGET_DEFAULT_SIZE,
  type WidgetId,
} from '../features/dashboard/widget-ids';

import { adoptRenamedPersistKey } from './persist-rename';

/**
 * The dashboard board, per repository.
 *
 * A store of its own rather than a slice of `ui-store`. Everything in that
 * store is a single value — a pane width, a selected sha, a chosen theme — and
 * every one of them applies to the app as a whole. This is a `Record` keyed by
 * repository that grows one entry per repo the user has ever customised, which
 * is a different shape with a different lifetime: it needs its own pruning
 * story, and folding it into `midnite-studio.ui` would mean a migration of that
 * key every time this one changed.
 *
 * What is persisted is only what a person *chose*. The layout, the widgets on
 * the board, the window and the author filter are all decisions; nothing
 * derived from a repository's data is written here, so a stale entry can never
 * make the board render numbers that are no longer true — at worst it names a
 * widget that has since been removed from the registry, which is read through
 * `WIDGETS` and simply skipped.
 */

/** One tile's position and size, in grid units. `react-grid-layout`'s shape. */
export type WidgetLayout = {
  i: WidgetId;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type DashboardBoard = {
  /** Which widgets are on the board, and where. */
  layout: WidgetLayout[];
  /**
   * Author emails the whole board is scoped to. **Empty means everyone**, the
   * same rule `MultiSelectMenu` follows everywhere else — so a contributor who
   * first appears after the filter was set is included rather than silently
   * missing from a board the user believes is unfiltered.
   */
  authors: string[];
  window: StatsWindow;
  /** The Scratchpad card's text — per board, so each dashboard keeps its own. */
  scratch?: string;
};

/**
 * One dashboard: a tab in the strip above the board (midnite's `DashboardTab`).
 * `pinned` tabs sort into a zone between the anchor and the rest and cannot be
 * closed.
 */
export type DashboardTab = { id: string; name: string; pinned?: boolean };

/** The original single dashboard, renamed. Its boards stay keyed by repo id. */
export const GIT_DASHBOARD_ID = 'git';
/** The second default dashboard; its layout is seeded lazily, see `defaultBoardFor`. */
export const AGENTS_DASHBOARD_ID = 'agents';
/** The third default dashboard — market cards, a simulated wallet, charts and news. */
export const FINANCE_DASHBOARD_ID = 'finance';
/** Hard ceiling on dashboards, as in midnite. */
export const MAX_DASHBOARDS = 10;
const MAX_NAME_LEN = 40;

export const DEFAULT_TABS: DashboardTab[] = [
  { id: GIT_DASHBOARD_ID, name: 'Git' },
  { id: AGENTS_DASHBOARD_ID, name: 'Agents' },
  { id: FINANCE_DASHBOARD_ID, name: 'Finance' },
];

/**
 * Which `boards` entry a dashboard reads and writes.
 *
 * The Git dashboard is per repository (its panels describe one repo), so its
 * key is the repo id — exactly what the single dashboard always used, which is
 * why migrating needed no data move. Every other dashboard is global: its key is
 * `dash:<id>` and does not follow the sidebar selection (its git panels, if it
 * has any, read whichever repo is selected).
 */
export const boardKeyFor = (dashboardId: string, repoId: string | null): string | null =>
  dashboardId === GIT_DASHBOARD_ID ? repoId : `dash:${dashboardId}`;

type DashboardState = {
  /** Keyed by `boardKeyFor`. An entry-less key gets `defaultBoardFor(key)`. */
  boards: Record<string, DashboardBoard>;
  /** The dashboards, in canonical order: Git, pinned, then the rest. */
  tabs: DashboardTab[];
  activeId: string;
  setActive: (id: string) => void;
  /** Returns the new id, or null at the ceiling. */
  addDashboard: (name: string) => string | null;
  closeDashboard: (id: string) => void;
  renameDashboard: (id: string, name: string) => void;
  togglePin: (id: string) => void;
  /** New order for the non-Git tabs; same-zone moves only. */
  reorderDashboards: (orderedNonGitIds: string[]) => void;
  setScratch: (key: string, text: string) => void;
  setLayout: (repoId: string, layout: WidgetLayout[]) => void;
  addWidget: (repoId: string, id: WidgetId) => void;
  removeWidget: (repoId: string, id: WidgetId) => void;
  /** Swap a widget with its neighbour in reading order — the non-drag reorder. */
  moveWidget: (repoId: string, id: WidgetId, direction: -1 | 1) => void;
  setAuthors: (repoId: string, authors: string[]) => void;
  setWindow: (repoId: string, window: StatsWindow) => void;
  resetLayout: (repoId: string) => void;
};

export const DEFAULT_BOARD: DashboardBoard = {
  layout: DEFAULT_LAYOUT,
  authors: [],
  window: '90d',
};

export const AGENTS_BOARD: DashboardBoard = {
  layout: AGENTS_LAYOUT,
  authors: [],
  window: '90d',
};

export const FINANCE_BOARD: DashboardBoard = {
  layout: FINANCE_LAYOUT,
  authors: [],
  window: '90d',
};

export const NEW_DASHBOARD_BOARD: DashboardBoard = {
  layout: NEW_DASHBOARD_LAYOUT,
  authors: [],
  window: '90d',
};

/**
 * What a key shows before anyone has touched it. Lazy rather than written at
 * migration time, so a fresh install and a migrated one both get the Agents
 * seed without a write — and neither disturbs a persisted Git board.
 */
export const defaultBoardFor = (key: string): DashboardBoard => {
  if (key === `dash:${AGENTS_DASHBOARD_ID}`) return AGENTS_BOARD;
  if (key === `dash:${FINANCE_DASHBOARD_ID}`) return FINANCE_BOARD;
  return key.startsWith('dash:') ? NEW_DASHBOARD_BOARD : DEFAULT_BOARD;
};

/** Git first, then pinned, then the rest — each group keeping its order. */
export const canonicalizeTabs = (tabs: DashboardTab[]): DashboardTab[] => {
  const git = tabs.filter((t) => t.id === GIT_DASHBOARD_ID);
  const rest = tabs.filter((t) => t.id !== GIT_DASHBOARD_ID);
  return [...git, ...rest.filter((t) => t.pinned), ...rest.filter((t) => !t.pinned)];
};

/** The board for a repo, or the shared default for one nobody has customised. */
export const boardFor = (
  boards: Record<string, DashboardBoard>,
  key: string | null,
): DashboardBoard => (key ? (boards[key] ?? defaultBoardFor(key)) : DEFAULT_BOARD);

/**
 * Reading order — top-to-bottom, then left-to-right.
 *
 * The order "move up" and "move down" operate in, and deliberately the same
 * order a screen reader meets the tiles in: a keyboard reorder that disagreed
 * with the reading order would move a tile somewhere the user cannot predict.
 */
export const inReadingOrder = (layout: readonly WidgetLayout[]): WidgetLayout[] =>
  [...layout].sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

/**
 * Where a newly added widget goes: a full-width row below everything.
 *
 * Below rather than into the first gap, because `react-grid-layout` will
 * compact it upward into a gap on its own if one exists — and a tile that
 * appears *inside* the existing board shuffles every tile after it, while one
 * that appears at the bottom is where the user's eye already is after using an
 * "Add widget" menu.
 */
const placeBelow = (layout: readonly WidgetLayout[], id: WidgetId): WidgetLayout => {
  const bottom = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  const size = WIDGET_DEFAULT_SIZE[id];
  return { i: id, x: 0, y: bottom, w: size.w, h: size.h };
};

/** Apply a change to one repo's board, materialising the default first. */
const edit =
  (repoId: string, change: (board: DashboardBoard) => DashboardBoard) =>
  (state: DashboardState): Partial<DashboardState> => ({
    boards: {
      ...state.boards,
      [repoId]: change(state.boards[repoId] ?? defaultBoardFor(repoId)),
    },
  });

/** The default board before the 3+3 rearrangement — see `migrate` below. */
const V1_DEFAULT_LAYOUT = [
  { i: 'calendar', x: 0, y: 0, w: 12, h: 6 },
  { i: 'contributors', x: 0, y: 6, w: 6, h: 8 },
  { i: 'activity', x: 6, y: 6, w: 6, h: 8 },
  { i: 'pulls', x: 0, y: 14, w: 4, h: 7 },
  { i: 'issues', x: 4, y: 14, w: 4, h: 7 },
  { i: 'runs', x: 8, y: 14, w: 4, h: 7 },
  { i: 'health', x: 0, y: 21, w: 12, h: 7 },
];

/**
 * Pre-rename state, adopted before the store hydrates — see
 * `persist-rename.ts` for why this cannot be a zustand `migrate`.
 */
adoptRenamedPersistKey('midnite-studio.dashboard', 'midnite-studio.dashboard');

/**
 * Persisted-state migration.
 *
 * v1 -> v2: the default board moved the calendar beside contributors and
 * activity. A board whose layout is byte-for-byte the old default was never
 * customised (any edit writes a copy), so it adopts the new one; anything else
 * is a person's choice and is left alone.
 *
 * v2 -> v3: multiple dashboards. The existing per-repo `boards` ARE the Git
 * dashboard, untouched (their keys are repo ids, which is what the Git
 * dashboard keeps using); all that is added is the tab list — Git, then the
 * Agents dashboard, whose layout is seeded lazily by `defaultBoardFor`.
 *
 * v3 -> v4: the Finance dashboard. Appended to the existing tab list rather
 * than replacing it — a person's own dashboards, their order, their pins and
 * which one was active all survive untouched; the new tab simply joins the end
 * of its zone. Its board, like Agents', is seeded lazily, so nothing is written
 * for it here. A list that already carries a `finance` tab is left alone, which
 * keeps the migration idempotent.
 */
export const migrateDashboardState = (persisted: unknown, version: number): DashboardState => {
  const state = (persisted ?? {}) as Partial<DashboardState>;
  if (version < 2 && state.boards) {
    for (const board of Object.values(state.boards)) {
      if (JSON.stringify(board.layout) === JSON.stringify(V1_DEFAULT_LAYOUT)) {
        board.layout = DEFAULT_LAYOUT;
      }
    }
  }
  if (version < 3) {
    state.tabs = DEFAULT_TABS;
    state.activeId = GIT_DASHBOARD_ID;
  } else if (version < 4 && Array.isArray(state.tabs)) {
    const tabs = state.tabs;
    if (!tabs.some((tab) => tab.id === FINANCE_DASHBOARD_ID)) {
      state.tabs = canonicalizeTabs([...tabs, { id: FINANCE_DASHBOARD_ID, name: 'Finance' }]);
    }
  }
  return state as DashboardState;
};

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set, get) => ({
      boards: {},

      /*
        MERGES the incoming positions rather than replacing the layout.

        Load-bearing, not tidiness. The board only renders the widgets this
        repository can populate, and `hasForge` is FALSE while the remotes query
        is still in flight — so the grid's first `onLayoutChange` reports only
        the stats widgets. A replace would take that first report as the whole
        truth and delete the three forge tiles from the saved board, a frame
        before the remotes arrive to say they belonged there. They would never
        come back: the layout no longer names them, so nothing would re-add
        them even once the repository was known to have a GitHub remote.

        The same applies whenever a widget is hidden rather than removed —
        switching to a local repository and back must not cost you your board.
      */
      setLayout: (repoId, layout) =>
        set(
          edit(repoId, (board) => {
            const incoming = new Map(layout.map((item) => [item.i, item]));
            const kept = board.layout.map((item) => incoming.get(item.i) ?? item);
            // Anything the grid reports that the board did not already carry —
            // there is no path that produces one today, but dropping it
            // silently would make a future one very hard to find.
            const added = layout.filter((item) => !board.layout.some((e) => e.i === item.i));
            return { ...board, layout: [...kept, ...added] };
          }),
        ),

      addWidget: (repoId, id) =>
        set(
          edit(repoId, (board) =>
            board.layout.some((item) => item.i === id)
              ? board
              : { ...board, layout: [...board.layout, placeBelow(board.layout, id)] },
          ),
        ),

      removeWidget: (repoId, id) =>
        set(
          edit(repoId, (board) => ({
            ...board,
            layout: board.layout.filter((item) => item.i !== id),
          })),
        ),

      /*
        Implemented as a swap of the two tiles' positions rather than a splice
        of an array, because the board is 2D: the tiles have coordinates, and
        "move up" has to mean "take the place of the tile above you" or the
        grid's own compaction immediately undoes it.
      */
      moveWidget: (repoId, id, direction) =>
        set(
          edit(repoId, (board) => {
            const ordered = inReadingOrder(board.layout);
            const index = ordered.findIndex((item) => item.i === id);
            const target = index + direction;
            if (index === -1 || target < 0 || target >= ordered.length) return board;

            const a = ordered[index];
            const b = ordered[target];
            if (!a || !b) return board;

            return {
              ...board,
              layout: board.layout.map((item) => {
                if (item.i === a.i) return { ...item, x: b.x, y: b.y };
                if (item.i === b.i) return { ...item, x: a.x, y: a.y };
                return item;
              }),
            };
          }),
        ),

      setAuthors: (repoId, authors) => set(edit(repoId, (board) => ({ ...board, authors }))),

      setWindow: (repoId, window) => set(edit(repoId, (board) => ({ ...board, window }))),

      /*
        Reset restores the layout only. The window and the author filter are
        answers to "what am I looking at", not "how is it arranged" — throwing
        them away would make Reset layout a button that silently changes the
        numbers as well as the boxes.
      */
      resetLayout: (repoId) =>
        set(edit(repoId, (board) => ({ ...board, layout: defaultBoardFor(repoId).layout }))),

      setScratch: (key, text) => set(edit(key, (board) => ({ ...board, scratch: text }))),

      tabs: DEFAULT_TABS,
      activeId: GIT_DASHBOARD_ID,

      setActive: (id) =>
        set((state) => (state.tabs.some((t) => t.id === id) ? { activeId: id } : state)),

      addDashboard: (name) => {
        if (get().tabs.length >= MAX_DASHBOARDS) return null;
        const id = crypto.randomUUID();
        const trimmed = name.trim().slice(0, MAX_NAME_LEN) || 'Dashboard';
        set((state) => ({
          tabs: canonicalizeTabs([...state.tabs, { id, name: trimmed }]),
          activeId: id,
        }));
        return id;
      },

      closeDashboard: (id) =>
        set((state) => {
          const tab = state.tabs.find((t) => t.id === id);
          // The Git anchor, a pinned (locked) tab and the last tab stay.
          if (!tab || tab.id === GIT_DASHBOARD_ID || tab.pinned || state.tabs.length <= 1) {
            return state;
          }
          const tabs = state.tabs.filter((t) => t.id !== id);
          const boards = { ...state.boards };
          delete boards[`dash:${id}`];
          return {
            tabs,
            boards,
            activeId: state.activeId === id ? (tabs[0]?.id ?? GIT_DASHBOARD_ID) : state.activeId,
          };
        }),

      renameDashboard: (id, name) => {
        const trimmed = name.trim().slice(0, MAX_NAME_LEN);
        if (!trimmed) return;
        set((state) => ({
          tabs: state.tabs.map((t) => (t.id === id ? { ...t, name: trimmed } : t)),
        }));
      },

      togglePin: (id) =>
        set((state) =>
          id === GIT_DASHBOARD_ID
            ? state
            : {
                tabs: canonicalizeTabs(
                  state.tabs.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)),
                ),
              },
        ),

      reorderDashboards: (orderedNonGitIds) =>
        set((state) => {
          const byId = new Map(state.tabs.map((t) => [t.id, t]));
          const git = state.tabs.filter((t) => t.id === GIT_DASHBOARD_ID);
          const reordered = orderedNonGitIds
            .map((id) => byId.get(id))
            .filter((t): t is DashboardTab => t !== undefined);
          return { tabs: canonicalizeTabs([...git, ...reordered]) };
        }),
    }),
    {
      name: 'midnite-studio.dashboard',
      version: 4,
      migrate: (persisted, version) => migrateDashboardState(persisted, version),
      /*
        Boards for repositories that are no longer open are kept.

        Closing a repo in this app is routine — the sidebar is a list you add
        to and remove from — and re-adding one to find its dashboard reset
        would make the persistence pointless. An entry is a handful of integers,
        so the unbounded growth is theoretical rather than real.
      */
      partialize: (state) => ({
        boards: state.boards,
        tabs: state.tabs,
        activeId: state.activeId,
      }),
    },
  ),
);
