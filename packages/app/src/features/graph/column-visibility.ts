/**
 * Which columns of the graph table are showing — pure, so the rules are tested
 * without mounting the graph.
 *
 * Commit message, Date and Graph are the table's spine and can never be
 * hidden; they are not in {@link GraphColumnVisibility} at all, only in
 * {@link GRAPH_COLUMN_MENU} as locked rows. CI keeps its own pre-existing
 * persisted flag (`graphShowCi`, also a Settings switch), so it is a menu item
 * but not a key here — one source of truth per column.
 */
export type ToggleableColumn = 'branchTag' | 'author' | 'sha' | 'diff' | 'diffChart';

export type GraphColumnVisibility = Record<ToggleableColumn, boolean>;

/** The Diff and Diff Chart columns are off until asked for: they cost a git call per page of rows. */
export const DEFAULT_GRAPH_COLUMN_VISIBILITY: GraphColumnVisibility = {
  branchTag: true,
  author: true,
  sha: true,
  diff: false,
  diffChart: false,
};

export type MenuColumn = ToggleableColumn | 'ci' | 'message' | 'date' | 'graph';

/** The dropdown's rows, in table order. `locked` rows are checked and disabled. */
export const GRAPH_COLUMN_MENU: ReadonlyArray<{ id: MenuColumn; label: string; locked: boolean }> = [
  { id: 'branchTag', label: 'Branch / Tag', locked: false },
  { id: 'ci', label: 'CI', locked: false },
  { id: 'graph', label: 'Graph', locked: true },
  { id: 'message', label: 'Commit message', locked: true },
  { id: 'diff', label: 'Diff', locked: false },
  { id: 'diffChart', label: 'Diff Chart', locked: false },
  { id: 'author', label: 'Author', locked: false },
  { id: 'date', label: 'Date', locked: true },
  { id: 'sha', label: 'SHA', locked: false },
];

/**
 * Coerce whatever was persisted into a complete record: unknown keys dropped,
 * non-boolean values and missing keys fall back to the default. A blob written
 * before the Diff column existed therefore comes back with it off.
 */
export function normalizeColumnVisibility(saved: unknown): GraphColumnVisibility {
  const out = { ...DEFAULT_GRAPH_COLUMN_VISIBILITY };
  if (typeof saved !== 'object' || saved === null) return out;
  for (const key of Object.keys(out) as ToggleableColumn[]) {
    const value = (saved as Record<string, unknown>)[key];
    if (typeof value === 'boolean') out[key] = value;
  }
  return out;
}

/** Set one column; a key that is not toggleable (a locked column) changes nothing. */
export function withColumnVisible(
  current: GraphColumnVisibility,
  column: string,
  visible: boolean,
): GraphColumnVisibility {
  if (!(column in DEFAULT_GRAPH_COLUMN_VISIBILITY)) return current;
  return { ...current, [column as ToggleableColumn]: visible };
}

/**
 * The columns to hide, as the space-separated token list the graph wrapper
 * carries in `data-graph-hide`. Hiding is CSS (`display: none` on both header
 * and rows), so toggling never re-renders the memoised rows.
 */
export function hiddenColumnTokens(visibility: GraphColumnVisibility): string {
  return (Object.keys(visibility) as ToggleableColumn[])
    .filter((key) => !visibility[key])
    .join(' ');
}
