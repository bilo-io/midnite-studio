/**
 * The shapes of the git graph's and diff's persisted UI state (Phase 113 Theme O).
 *
 * Moved here from Studio's `ui-store.ts`, verbatim, when the graph and the diff moved into the frame:
 * the `GitHost` port names them, so they must live below every app that implements it. `ui-store`
 * imports and re-exports each one, so none of its importers moved and the stored values are the same.
 */

import type { GraphColumnVisibility } from './column-visibility';
import type { GraphDensity, GraphThemeId } from './graph-themes';
import type { ProvenanceMarkMode } from './provenance-display';

/** Layout preference for diff rendering: unified (single column) or split (side-by-side). */
export type DiffLayout = 'unified' | 'split';

/** What the graph's detail panel shows (Phase 22 Theme D) — see `graphSelection`. */
export type GraphSelection =
  | { kind: 'commit'; sha: string }
  | { kind: 'stash'; selector: string }
  /** The Conflict Resolution Studio for one path (Phase 47 Theme D). */
  | { kind: 'conflict'; path: string }
  /** The working copy, expanded inline under the graph's uncommitted-changes row. */
  | { kind: 'working-tree' }
  | null;

/** Widths of the graph table's fixed-width columns. */
export type GraphColumns = {
  /** The BRANCH / TAG column, left of the lane gutter. */
  branchTag: number;
  /**
   * The Author column — rendered only by the styles whose node is a dot
   * (`showsAuthorColumn`), sized always, so switching style and back does not
   * lose the width you dragged.
   */
  author: number;
  /**
   * The lane gutter.
   *
   * Unlike its neighbours this width is a REQUEST, not a result: the graph
   * clamps it to what the current history and style can actually paint, so a
   * value carried into a repo with more branches quietly widens to keep every
   * lane visible rather than clipping them. Stored as a plain number all the
   * same — the default is the widest gutter any style can want, which every
   * clamp turns into "as wide as the lanes need".
   */
  graph: number;
  date: number;
  sha: number;
};

export const DEFAULT_GRAPH_COLUMNS: GraphColumns = {
  branchTag: 180,
  author: 140,
  // 12 lanes at GitKraken's 30px — the widest natural gutter any style asks
  // for, so out of the box the clamp resolves it to the exact fit and the
  // column behaves as it always has until somebody drags it.
  graph: 360,
  date: 112,
  sha: 64,
};

/** Drag bounds, colocated with the defaults so nothing can clamp to a stale pair. */
export const GRAPH_COLUMN_BOUNDS = {
  branchTag: { min: 100, max: 400 },
  author: { min: 80, max: 320 },
  date: { min: 72, max: 240 },
  sha: { min: 56, max: 160 },
  // The gutter has no entry: both its bounds are geometry — the natural fit of
  // the loaded history and the point past which its lanes stop being separable
  // — so they are computed per render in `GraphView` and handed to
  // `useGraphColumns`. A constant pair here would be a second answer to a
  // question that already has one.
} as const;

/**
 * The persisted UI state the graph and the diff read and write — the part of an app's own store the
 * `GitHost` port hands over (`useUi`/`getUi`). Studio's `UiState` is a structural superset of it, so
 * Studio passes `useUiStore` itself and the compiler holds the two together; another app keeps a small
 * store of exactly this shape.
 */
export type GitUiState = {
  /** The repository the graph shows; `null` renders the empty state. */
  selectedRepoId: string | null;
  /** The checkout within it, or `null` for its primary worktree. */
  selectedWorktreePath: string | null;
  graphSelection: GraphSelection;
  selectCommit: (sha: string | null) => void;
  selectWorkingTree: (open: boolean) => void;
  selectStash: (selector: string | null) => void;
  selectConflict: (path: string | null) => void;
  /** A nonce: asking twice brings the working copy into view twice. */
  graphWorkingCopyReveal: number;

  layout: { detailWidth: number; graphInlineHeight: number };
  setLayout: (key: 'detailWidth' | 'graphInlineHeight', value: number) => void;
  graphColumns: GraphColumns;
  setGraphColumn: <K extends keyof GraphColumns>(key: K, value: number) => void;
  graphColumnVisibility: GraphColumnVisibility;
  setGraphColumnVisible: (column: string, visible: boolean) => void;

  graphTheme: GraphThemeId;
  graphDensity: GraphDensity;
  graphProvenanceMark: ProvenanceMarkMode;
  graphShowCi: boolean;
  setGraphShowCi: (show: boolean) => void;

  graphRefFilter: string[];
  setGraphRefFilter: (refs: string[]) => void;
  graphAuthorFilter: string[];
  setGraphAuthorFilter: (emails: string[]) => void;
  graphSessionFilter: string | null;
  setGraphSessionFilter: (sessionId: string | null) => void;
  graphShaFilter: string[] | null;
  setGraphShaFilter: (shas: string[] | null) => void;
  graphProvenanceFilter: string;
  setGraphProvenanceFilter: (filter: string) => void;

  diffLayout: DiffLayout;
  toggleDiffLayout: () => void;
  diffShowOldGutter: boolean;
  toggleDiffOldGutter: () => void;
};
