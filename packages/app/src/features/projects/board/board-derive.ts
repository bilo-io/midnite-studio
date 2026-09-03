import type { ForgeProjectField, ForgeProjectItem, TerminalSession } from '@midnite/studio-shared';

import { sessionPhase, type ConnectionState } from '../../terminal/terminal-store';

/**
 * The `Status` single-select field's own option id — every real column keys
 * on this. `NO_STATUS_COLUMN_ID` never collides with a real one: GraphQL node
 * ids are opaque base64-ish strings, never `__no_status__`.
 */
export const NO_STATUS_COLUMN_ID = '__no_status__';

export type BoardColumn = {
  id: string;
  name: string;
  /** The option's own colour, empty for the synthetic "No status" column. */
  color: string;
  items: readonly ForgeProjectItem[];
};

/**
 * A board's columns, from the project's `Status` field and its items (Phase
 * 41 Theme A).
 *
 * **Pure and exported** so option order, a missing field and an orphaned
 * option id are each a unit test, not a mounted component — the phase doc's
 * own acceptance requirement. Columns come in the field's own option order,
 * with a leading "No status" column for two cases that read identically to a
 * user: an item with no `Status` value at all, and one whose value points at
 * an option the board no longer has (deleted or renamed on github.com since
 * the item was set — see `ForgeProjectFieldValueSchema`'s own note on why a
 * `single_select` value is not cross-checked against today's option list).
 * Neither is dropped, and neither is invented into the first real column.
 */
export function deriveColumns(
  field: ForgeProjectField | null | undefined,
  items: readonly ForgeProjectItem[],
): BoardColumn[] {
  if (!field || field.dataType !== 'single_select') return [];

  const columns = new Map<string, BoardColumn>();
  columns.set(NO_STATUS_COLUMN_ID, { id: NO_STATUS_COLUMN_ID, name: 'No status', color: '', items: [] });
  for (const option of field.options) {
    columns.set(option.id, { id: option.id, name: option.name, color: option.color, items: [] });
  }

  // Mutated in place, then frozen into the returned `items` arrays below —
  // simplest way to bucket in one pass without rebuilding each column's array
  // per item.
  const buckets = new Map<string, ForgeProjectItem[]>();
  for (const column of columns.values()) buckets.set(column.id, []);

  for (const item of items) {
    const value = item.fieldValues[field.id];
    const columnId =
      value?.dataType === 'single_select' && columns.has(value.optionId) ? value.optionId : NO_STATUS_COLUMN_ID;
    buckets.get(columnId)!.push(item);
  }

  return Array.from(columns.values()).map((column) => ({ ...column, items: buckets.get(column.id)! }));
}

/** A body past this length is cut, with a notice — an issue body is unbounded remote text. */
const BODY_CHAR_CAP = 4000;

/**
 * The card composer's prompt (Phase 41 Theme G) — title, url, assignees,
 * labels and the repo path, plus the item's body capped at
 * {@link BODY_CHAR_CAP} characters with a visible truncation notice.
 *
 * **Pure and exported** so the composition — including the cap — is a unit
 * test rather than something only visible by opening a card. Shown to the
 * user in full and editable before Start, never sent unread: this is the
 * seed text, not the final prompt.
 */
export function composeCardPrompt(item: ForgeProjectItem, repoPath: string): string {
  const content = item.content;
  const lines: string[] = [];

  lines.push(content.type === 'draft' ? content.title : `${content.title} (#${content.number})`);
  if (content.type !== 'draft') lines.push(content.url);
  if (content.assignees.length > 0) lines.push(`Assignees: ${content.assignees.join(', ')}`);
  if (content.type !== 'draft' && content.labels.length > 0) {
    lines.push(`Labels: ${content.labels.join(', ')}`);
  }
  lines.push(`Repo: ${repoPath}`);

  const body = content.body.trim();
  if (body.length > 0) {
    lines.push('');
    if (body.length > BODY_CHAR_CAP) {
      lines.push(body.slice(0, BODY_CHAR_CAP));
      lines.push(`\n[…truncated — ${body.length - BODY_CHAR_CAP} more characters omitted]`);
    } else {
      lines.push(body);
    }
  }

  return lines.join('\n');
}

/**
 * Kanban sessions whose card no longer exists on the currently-open board
 * (Phase 41 Theme H) — the item was moved off this board, or the board
 * switched entirely. Pure so the reconciliation itself is a unit test: the
 * caller applies it via `rehomeSession` for each id returned.
 *
 * Scoped to `board.projectId` deliberately: a `kanban` session bound to
 * *another* board's card is not orphaned just because it is invisible on
 * this one — see `TerminalSession.taskRef`'s own note.
 */
export function sessionsToRehome(
  sessions: readonly TerminalSession[],
  board: { projectId: string; itemIds: ReadonlySet<string> },
): string[] {
  return sessions
    .filter(
      (s) =>
        s.surface === 'kanban' &&
        s.taskRef !== undefined &&
        s.taskRef.projectId === board.projectId &&
        !board.itemIds.has(s.taskRef.itemId),
    )
    .map((s) => s.id);
}

/**
 * The soft-warn threshold at which one more concurrently-*running* card
 * session gets a heads-up rather than a block (Phase 50 Theme A) — Phase 41
 * Theme I's own recorded recommendation, and deliberately distinct from
 * Theme E's 4-instance *mounted xterm* cap: five agents may be running on one
 * board while at most four of their terminals are actually painted.
 */
export const CONCURRENT_CARD_SESSION_SOFT_LIMIT = 5;

/**
 * How many `kanban` sessions bound to this board are currently live — pure,
 * so the threshold itself is a unit test rather than something only a
 * running app can exercise. Ended and asleep sessions don't count: Theme A
 * keeps them bound until Dismissed, but a dismissed-pending card isn't
 * spending anything.
 */
export function countLiveCardSessions(
  sessions: readonly TerminalSession[],
  states: Record<string, ConnectionState>,
  projectId: string,
): number {
  return sessions.filter(
    (s) =>
      s.surface === 'kanban' &&
      s.taskRef?.projectId === projectId &&
      sessionPhase(s, states[s.id]) === 'live',
  ).length;
}
