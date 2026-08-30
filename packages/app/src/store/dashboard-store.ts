import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { StatsWindow } from '@midnite/studio-shared';

import { DEFAULT_LAYOUT, type WidgetId } from '../features/dashboard/widget-ids';

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
};

type DashboardState = {
  /** Keyed by repoId. A repo with no entry gets `DEFAULT_BOARD`. */
  boards: Record<string, DashboardBoard>;
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

/** The board for a repo, or the shared default for one nobody has customised. */
export const boardFor = (
  boards: Record<string, DashboardBoard>,
  repoId: string | null,
): DashboardBoard => (repoId ? (boards[repoId] ?? DEFAULT_BOARD) : DEFAULT_BOARD);

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
  const spec = DEFAULT_LAYOUT.find((item) => item.i === id);
  return { i: id, x: 0, y: bottom, w: spec?.w ?? 6, h: spec?.h ?? 6 };
};

/** Apply a change to one repo's board, materialising the default first. */
const edit =
  (repoId: string, change: (board: DashboardBoard) => DashboardBoard) =>
  (state: DashboardState): Partial<DashboardState> => ({
    boards: {
      ...state.boards,
      [repoId]: change(state.boards[repoId] ?? DEFAULT_BOARD),
    },
  });

/**
 * Pre-rename state, adopted before the store hydrates — see
 * `persist-rename.ts` for why this cannot be a zustand `migrate`.
 */
adoptRenamedPersistKey('midnite-studio.dashboard', 'midnite-studio.dashboard');

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
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
        set(edit(repoId, (board) => ({ ...board, layout: DEFAULT_LAYOUT }))),
    }),
    {
      name: 'midnite-studio.dashboard',
      version: 1,
      /*
        Boards for repositories that are no longer open are kept.

        Closing a repo in this app is routine — the sidebar is a list you add
        to and remove from — and re-adding one to find its dashboard reset
        would make the persistence pointless. An entry is a handful of integers,
        so the unbounded growth is theoretical rather than real.
      */
      partialize: (state) => ({ boards: state.boards }),
    },
  ),
);
