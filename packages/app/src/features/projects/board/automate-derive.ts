import type { ForgeGraph, ForgeProjectItem } from '@midnite/studio-shared';

import type { BoardColumn } from './board-derive';

/**
 * Auto-mate's own backlog column (Phase 95 Theme H) — matched by name,
 * case-insensitively, exactly like `columnSkillKey`'s own normalisation. The
 * phase doc names it literally ("the next unblocked card in board order in
 * the Todo column"), so this looks for a column called "Todo" rather than
 * inventing a per-project picker for which column is the backlog — the same
 * scope call `resolveColumnSkill`'s own default map makes for "In progress"/
 * "In review". A board with no such column gives Auto-mate nothing to do,
 * which is a stopped state (`nextUnblockedCard` below), not an error.
 */
export function findTodoColumn(columns: readonly BoardColumn[]): BoardColumn | undefined {
  return columns.find((column) => column.name.trim().toLowerCase() === 'todo');
}

/**
 * The next card Auto-mate should start, or `undefined` when there is nothing
 * left to pick up — board order (`column.items`'s own array order, which
 * mirrors the board's own item order), first item that:
 *  - is not already excluded (already running, or already tried and failed
 *    this pass — the caller's own bookkeeping, not this function's),
 *  - has a graph node (`graph.nodes`, keyed by `itemId`) marking it `ready`.
 *
 * A missing graph node — the item fell outside `resolveForgeGraph`'s node
 * cap, or the graph has not been computed for some other reason — reads as
 * **not ready**, not ready-by-default: Auto-mate would rather sit idle than
 * launch a skill on a card whose blockers it could not actually check.
 */
export function nextUnblockedCard(
  column: BoardColumn,
  graph: ForgeGraph,
  excludeItemIds: ReadonlySet<string>,
): ForgeProjectItem | undefined {
  const readyByItemId = new Map(graph.nodes.map((node) => [node.itemId, node.ready]));
  return column.items.find((item) => !excludeItemIds.has(item.id) && readyByItemId.get(item.id) === true);
}
