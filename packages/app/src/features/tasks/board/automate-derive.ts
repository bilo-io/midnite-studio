import type { ForgeGraph, ForgeProjectItem, WorkflowRun } from '@midnite/studio-shared';

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
 *  - has a graph node (`graph.nodes`, keyed by `itemId`) marking it not
 *    `blocked` — **not** the node's own `ready` flag, which
 *    `resolveForgeGraph` defines narrowly as "had at least one blocker and
 *    all are now closed" (`counts.total > 0`); a card that never had a
 *    blocker in the first place — the overwhelmingly common case — reads
 *    `ready: false` there while being exactly as workable as one whose
 *    blockers just cleared. `blocked` (`unmetBlockerCount > 0`) is the one
 *    field that actually means "workable right now" for both cases.
 *
 * A missing graph node — the item fell outside `resolveForgeGraph`'s node
 * cap, or the graph has not been computed for some other reason — reads as
 * **blocked**, not workable-by-default: Auto-mate would rather sit idle
 * than launch a skill on a card whose blockers it could not actually check.
 */
export function nextUnblockedCard(
  column: BoardColumn,
  graph: ForgeGraph,
  excludeItemIds: ReadonlySet<string>,
): ForgeProjectItem | undefined {
  const blockedByItemId = new Map(graph.nodes.map((node) => [node.itemId, node.blocked]));
  return column.items.find((item) => !excludeItemIds.has(item.id) && blockedByItemId.get(item.id) === false);
}

/**
 * Whether a workflow run should read as "still going" — never as done, and
 * never eligible for Auto-mate to treat as a stopped state — because a human
 * gate is sitting `waiting` inside it (Phase 97 Theme D's own bullet: "a card
 * whose workflow run is waiting is not done").
 *
 * **No card actually calls this yet.** Auto-mate today drives a card through
 * a roster agent's own terminal session (`use-automate.ts`), never a
 * workflow run — that file's own doc comment names the missing link
 * explicitly ("a workflow's own Auto-mate... needs Theme I's engine"), so
 * there is no `card → WorkflowRun` reference anywhere in this codebase to
 * read from yet. This is the pure predicate that integration will need the
 * day it exists, kept here (rather than invented as a fake call site) so the
 * rule is written down, tested, and ready rather than silently dropped.
 */
export function workflowRunNeedsAttention(run: Pick<WorkflowRun, 'status' | 'nodes'>): boolean {
  return run.status === 'running' && run.nodes.some((node) => node.status === 'waiting');
}
