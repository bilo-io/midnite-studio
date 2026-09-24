import { BUILTIN_AGENTS, type ForgeProjectField, type ForgeProjectItem, type TerminalSession } from '@midnite/studio-shared';

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
 * A board's columns, from its grouping field and its items (Phase 41 Theme A,
 * generalised to any `single_select` or `iteration` field by Phase 52 Theme
 * B — the board's own `Status`-only grouping being exactly what that theme
 * reverses).
 *
 * **Pure and exported** so option order, a missing field and an orphaned
 * option id are each a unit test, not a mounted component — the phase doc's
 * own acceptance requirement. A leading "No `<field name>`" column carries
 * two cases that read identically to a user: an item with no value for the
 * field at all, and (for `single_select`) one whose value points at an option
 * the board no longer has (deleted or renamed on github.com since the item
 * was set — see `ForgeProjectFieldValueSchema`'s own note on why a
 * `single_select` value is not cross-checked against today's option list).
 * Neither is dropped, and neither is invented into the first real column.
 */
export function deriveColumns(
  field: ForgeProjectField | null | undefined,
  items: readonly ForgeProjectItem[],
): BoardColumn[] {
  if (!field) return [];
  if (field.dataType === 'single_select') return deriveSingleSelectColumns(field, items);
  if (field.dataType === 'iteration') return deriveIterationColumns(field, items);
  return [];
}

function deriveSingleSelectColumns(
  field: Extract<ForgeProjectField, { dataType: 'single_select' }>,
  items: readonly ForgeProjectItem[],
): BoardColumn[] {
  const columns = new Map<string, BoardColumn>();
  columns.set(NO_STATUS_COLUMN_ID, { id: NO_STATUS_COLUMN_ID, name: `No ${field.name}`, color: '', items: [] });
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

/**
 * An iteration field carries no enumerable option list the way `single_select`
 * does (`ForgeProjectFieldSchema`'s `iteration` member is identity-only) —
 * its columns are discovered from the items themselves, in first-seen order,
 * which is also why grouping by iteration is read-only: there is no fixed
 * option set a drop could target that isn't itself derived from who is
 * already in it.
 */
function deriveIterationColumns(
  field: Extract<ForgeProjectField, { dataType: 'iteration' }>,
  items: readonly ForgeProjectItem[],
): BoardColumn[] {
  const columns = new Map<string, BoardColumn>();
  columns.set(NO_STATUS_COLUMN_ID, { id: NO_STATUS_COLUMN_ID, name: `No ${field.name}`, color: '', items: [] });
  const buckets = new Map<string, ForgeProjectItem[]>();
  buckets.set(NO_STATUS_COLUMN_ID, []);

  for (const item of items) {
    const value = item.fieldValues[field.id];
    if (value?.dataType === 'iteration') {
      if (!columns.has(value.iterationId)) {
        columns.set(value.iterationId, { id: value.iterationId, name: value.title || value.iterationId, color: '', items: [] });
        buckets.set(value.iterationId, []);
      }
      buckets.get(value.iterationId)!.push(item);
    } else {
      buckets.get(NO_STATUS_COLUMN_ID)!.push(item);
    }
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
 * The Play button's shrunk prompt (Phase 92 Theme B) — a skill template plus
 * the issue's own link, not the whole issue. Mirrors `skillHandoff`'s own
 * `` `${skillTemplate} ${body}` `` composition (`use-skill-handoff.ts:104`)
 * with the issue URL standing in for `body`: the skill itself is expected to
 * fetch whatever it needs from that link, which is the point of handing it a
 * link instead of a paste.
 *
 * **`composeCardPrompt` above is untouched** — it keeps backing
 * `CardComposer`'s own human-reviewed textarea; this is a separate, smaller
 * composition for the quick Play button's own skill-launch path.
 *
 * A draft item has no `url` — nothing to hand a skill as a link — so this
 * falls back to `composeCardPrompt`'s existing draft-safe output (title +
 * body) rather than composing a linkless, meaningless prompt.
 */
export function composeSkillLaunchPrompt(item: ForgeProjectItem, skillTemplate: string): string {
  if (item.content.type === 'draft') return composeCardPrompt(item, '');
  return `${skillTemplate} ${item.content.url}`;
}

/**
 * Drag-to-skill's own column-name → skill map (Phase 95 Theme G) — matched
 * case-insensitively against a column's own `name`, the same normalisation
 * `resolveColumnSkill` below applies to a per-project override. Out of the
 * box, dropping a card into a column named either of these two starts the
 * matching skill; every other column keeps today's status-only drop.
 */
export const DEFAULT_COLUMN_SKILLS: Readonly<Record<string, string>> = Object.freeze({
  'in progress': '/midnite-create',
  'in review': '/midnite-review',
});

/** `DEFAULT_COLUMN_SKILLS`' own lookup key for a column name — trimmed and
 *  lower-cased, so "In Progress" and "in progress" are the same column. */
export function columnSkillKey(columnName: string): string {
  return columnName.trim().toLowerCase();
}

/**
 * The skill a drop into `columnName` should start, resolving a project's own
 * override over the built-in default (Theme G's "editable per project").
 *
 * `overrides` carries `''` for a column explicitly un-mapped by the user —
 * distinct from the key being merely absent, which falls through to the
 * default — so a user can turn off `DEFAULT_COLUMN_SKILLS`' own "In
 * progress"/"In review" mapping without picking a replacement. `undefined`
 * (no mapping at all, from either source) means "keep today's status-only
 * drop" — the caller's own cue to skip the skill-launch flow entirely.
 */
export function resolveColumnSkill(
  columnName: string,
  overrides: Readonly<Record<string, string>> | undefined,
): string | undefined {
  const key = columnSkillKey(columnName);
  const override = overrides?.[key];
  if (override !== undefined) return override === '' ? undefined : override;
  return DEFAULT_COLUMN_SKILLS[key];
}

/**
 * The link a drag-to-skill launch hands the started skill (Theme G) — an
 * issue's own linked PR when it has one, else the item's own url. A draft
 * has neither, so this returns `null` and the caller skips the launch
 * entirely (mirrors `composeSkillLaunchPrompt`'s own draft guard, but drag-
 * to-skill has no textarea to fall back into showing).
 *
 * `usedIssueFallback` is `true` only when an `issue` item carried no linked
 * PR at all — the case the phase doc's own "In review" trigger names
 * ("with no PR, it falls back to the issue URL and says so in the toast").
 * A `pull` item IS the PR, so there is no fallback to flag; an `issue` with
 * a linked PR resolved it on the first try, same as a `pull`.
 */
export function resolveDragSkillLink(
  item: ForgeProjectItem,
): { url: string; usedIssueFallback: boolean } | null {
  if (item.content.type === 'draft') return null;
  if (item.content.type === 'issue') {
    const pr = item.content.linkedPrs[0];
    if (pr) return { url: pr.url, usedIssueFallback: false };
    return { url: item.content.url, usedIssueFallback: true };
  }
  return { url: item.content.url, usedIssueFallback: false };
}

/** What a drop into a column should do next (Theme G) — the whole fork
 *  `board-view.tsx`'s `maybeStartColumnSkill` reads, pulled out as its own
 *  pure function so the decision itself (as opposed to the toast/timer/
 *  `startAgent` machinery around it, which needs a real DOM drag to exercise
 *  — `docs/TESTING.md`'s own pointer-drag rule) is a plain unit test. */
export type ColumnSkillAction =
  | { kind: 'none' }
  | { kind: 'reveal'; sessionId: string }
  | { kind: 'skip' }
  | { kind: 'launch'; skillTemplate: string; url: string; usedIssueFallback: boolean };

/**
 * `columnName` has no mapped skill → `'none'` (today's plain status-only
 * drop). A LIVE session already bound to this card → `'reveal'` — the phase
 * doc's own "respects an existing live session… reveal, don't double-launch"
 * — checked before the link, since there is nothing left to launch either
 * way once a session already exists. A draft with a mapped skill but no
 * link to hand it → `'skip'`. Otherwise → `'launch'`, the toast-then-
 * `startAgent` path.
 */
export function decideColumnSkillAction(
  item: ForgeProjectItem,
  columnName: string,
  overrides: Readonly<Record<string, string>> | undefined,
  existingLiveSessionId: string | undefined,
): ColumnSkillAction {
  const skillTemplate = resolveColumnSkill(columnName, overrides);
  if (!skillTemplate) return { kind: 'none' };
  if (existingLiveSessionId !== undefined) return { kind: 'reveal', sessionId: existingLiveSessionId };

  const link = resolveDragSkillLink(item);
  if (!link) return { kind: 'skip' };

  return { kind: 'launch', skillTemplate, url: link.url, usedIssueFallback: link.usedIssueFallback };
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

/**
 * The agent a new card-launched session should default to (Phase 92 Theme A,
 * hoisted here in Theme G once drag-to-skill needed the identical logic
 * `useCardPlay`'s own `launchWithSkill` already had inline): the most
 * recently created `agent`-kind session in this repo, or the roster's first
 * built-in agent when none has run here yet.
 *
 * Pure over `sessions` rather than a hook, so both a card's Play button and a
 * drag-to-skill drop resolve the same default without either re-deriving it.
 */
export function resolveMostRecentAgentId(
  sessions: readonly TerminalSession[],
  repoId: string | null | undefined,
): string {
  const mostRecent = sessions
    .filter((s) => s.repoId === repoId && s.kind === 'agent' && s.agentId !== undefined)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return mostRecent?.agentId ?? BUILTIN_AGENTS[0]?.id ?? 'claude';
}
