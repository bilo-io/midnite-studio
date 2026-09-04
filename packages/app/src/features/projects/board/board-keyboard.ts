import type { BoardColumn } from './board-derive';

/**
 * Pure roving-tabindex arithmetic for the board (Phase 52 Theme G) — one
 * Tab stop for the board as a whole, `←`/`→` between columns and `↑`/`↓`
 * within one, both operating on `columns` (already filtered/regrouped by the
 * time they run) rather than the raw item list, so a card's *position* is
 * always "where it currently renders", not some earlier snapshot.
 */
export type BoardPosition = { columnIndex: number; itemIndex: number };

/** Where a card currently sits, or `null` if it isn't in any column at all —
 *  filtered out, its column collapsed away entirely, or simply gone. */
export function findCardPosition(columns: readonly BoardColumn[], itemId: string): BoardPosition | null {
  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const itemIndex = columns[columnIndex]!.items.findIndex((item) => item.id === itemId);
    if (itemIndex !== -1) return { columnIndex, itemIndex };
  }
  return null;
}

/**
 * Every card, in column-then-row order — what "nearest remaining card"
 * falls back to once the focused one has actually disappeared or its own
 * column has collapsed out from under it. `collapsed` defaults to empty so
 * every existing caller that doesn't care about collapse keeps working.
 */
export function flattenCardIds(columns: readonly BoardColumn[], collapsed: ReadonlySet<string> = new Set()): string[] {
  return columns.filter((column) => !collapsed.has(column.id)).flatMap((column) => column.items.map((item) => item.id));
}

export function positionToItemId(columns: readonly BoardColumn[], position: BoardPosition): string | null {
  return columns[position.columnIndex]?.items[position.itemIndex]?.id ?? null;
}

/** `↑`/`↓` — clamped at the column's own ends, never wraps into another column. */
export function moveVertical(
  columns: readonly BoardColumn[],
  position: BoardPosition,
  delta: 1 | -1,
): BoardPosition {
  const column = columns[position.columnIndex];
  if (!column) return position;
  const itemIndex = Math.max(0, Math.min(column.items.length - 1, position.itemIndex + delta));
  return { columnIndex: position.columnIndex, itemIndex };
}

/**
 * `←`/`→` — skips a collapsed or empty column entirely rather than making it
 * a focus stop with nothing to land on, per the phase doc's own rule. Row
 * index carries over into the target column, clamped to its size. A no-op
 * (returns `position` unchanged) once there is no reachable column left in
 * that direction.
 */
export function moveHorizontal(
  columns: readonly BoardColumn[],
  collapsed: ReadonlySet<string>,
  position: BoardPosition,
  delta: 1 | -1,
): BoardPosition {
  let columnIndex = position.columnIndex;
  for (let step = 0; step < columns.length; step += 1) {
    columnIndex += delta;
    if (columnIndex < 0 || columnIndex >= columns.length) return position;
    const column = columns[columnIndex]!;
    if (collapsed.has(column.id) || column.items.length === 0) continue;
    const itemIndex = Math.min(position.itemIndex, column.items.length - 1);
    return { columnIndex, itemIndex };
  }
  return position;
}

/**
 * The card to refocus once the previously-focused one is confirmed
 * unusable — gone from `columns` entirely (filtered out, regrouped away),
 * or merely hidden because its own column just collapsed. The item at the
 * same flattened index as before, clamped to the new (possibly shorter)
 * end and skipping any collapsed column same as the move functions do.
 * `null` only when the board has no navigable card left at all; the caller
 * decides "unusable" itself (checking {@link findCardPosition} and
 * `collapsed`), so this never has to guess.
 */
export function nearestCardId(
  columns: readonly BoardColumn[],
  previousFlatIndex: number,
  collapsed: ReadonlySet<string> = new Set(),
): string | null {
  const flat = flattenCardIds(columns, collapsed);
  if (flat.length === 0) return null;
  return flat[Math.max(0, Math.min(previousFlatIndex, flat.length - 1))] ?? null;
}
