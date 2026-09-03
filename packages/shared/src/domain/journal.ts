import { z } from 'zod';

/**
 * The app's ops journal (Phase 22 Theme H) — a permanent, per-repo record of
 * every write the app itself performed, alongside the toast that announces it
 * and the History view that lists it.
 *
 * This is deliberately NOT the reflog (Theme G). The reflog records what
 * *this repository* saw happen to a ref, from any writer — this app, a
 * terminal, another tool. The journal records what *this app* did, and only
 * that, which is the one thing the reflog cannot say on its own. They are
 * rendered as two tabs in the same view rather than merged into one list.
 */

/**
 * Every op the journal can describe.
 *
 * A superset of the renderer's `GitOpId` (`services/use-status.ts`) — that
 * union drives the status bar's op-progress chip and does not know about
 * stash, so `stash-push`/`stash-drop`/`stash-store` are added here. Kept as
 * its own enum rather than importing `GitOpId` because `shared` may not
 * depend on `app` — the dependency runs the other way.
 */
export const JOURNAL_OPS = [
  'fetch',
  'pull',
  'push',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'checkout',
  'reset',
  'stage',
  'unstage',
  'discard',
  'commit',
  'branch-create',
  'branch-delete',
  'branch-rename',
  'tag-create',
  'worktree-add',
  'abort',
  'continue',
  'stash-push',
  'stash-drop',
  /**
   * `git stash store` — the forward write Theme H uses to undo a `stash-drop`.
   * Its own op rather than reusing `stash-push`: it never touches the working
   * tree or the index, and conflating the two would make a journal entry lie
   * about which one happened.
   */
  'stash-store',
  /** Whole-file conflict resolution (Phase 47 Theme B) — accept-ours/theirs/base. */
  'conflict-resolve-whole-file',
  /** One region within a conflicted path (Phase 47 Theme C/D) — ours/theirs/both. */
  'conflict-apply-hunk',
] as const;
export const JournalOpSchema = z.enum(JOURNAL_OPS);
export type JournalOp = z.infer<typeof JournalOpSchema>;

/**
 * One entry in the ops journal.
 *
 * `headBefore`/`headAfter`/`refBefore` are deliberately generic rather than
 * literally "what `HEAD` was": for `commit`/`reset`/`checkout` they are
 * exactly that (`refBefore: 'HEAD'`), but for a ref that is not HEAD —
 * `branch-delete`, `branch-create` — they name the sha and the ref THAT
 * OPERATION moved or removed, not the repository's actual HEAD, which may not
 * have moved at all (deleting a branch you are not on never touches HEAD).
 * `refBefore` says which ref the pair is about; a reader must not assume it is
 * always `HEAD`.
 *
 * `undoable` is a per-ENTRY fact, not a per-op one: `isUndoableOpKind` says
 * whether this KIND of op is ever undoable (ref-shaped, worktree left
 * intact); `undoable` on the entry additionally requires that the anchor this
 * particular instance needs (typically `headBefore`) was actually captured.
 * An op that is undoable in principle still ends up `undoable: false` here if
 * its anchor could not be read — a wrong `true` is a data-loss bug, a wrong
 * `false` just hides a button.
 *
 * There is no `reason` field: the one-line explanation shown for an
 * un-undoable entry is a pure function of `op` (`undoReason`), not stored
 * data, so the schema stays exactly the nine fields the phase doc names.
 */
export const OpJournalEntrySchema = z.object({
  id: z.string(),
  repoId: z.string(),
  /** Absent means the repository's primary checkout, as everywhere else. */
  worktreePath: z.string().optional(),
  op: JournalOpSchema,
  /** A short, human sentence — "Committed", "Deleted branch feature/x". */
  label: z.string(),
  /** Epoch milliseconds. */
  at: z.number(),
  headBefore: z.string().nullable(),
  headAfter: z.string().nullable(),
  /** Fully qualified where the op has one ref to name (`refs/heads/main`). */
  refBefore: z.string().nullable(),
  undoable: z.boolean(),
});
export type OpJournalEntry = z.infer<typeof OpJournalEntrySchema>;

/**
 * Whether this KIND of op is undoable in principle — ref-shaped, per the
 * phase's central constraint: the reflog records where refs pointed, not
 * what the working tree or the index held, so the undoable set is exactly
 * the ops that moved a ref and left the worktree alone.
 *
 * A switch with no `default` arm: adding a value to `JOURNAL_OPS` without
 * deciding its undoability here is a compile error, which is the point — a
 * wrong answer here is a data-loss bug, not a cosmetic one.
 */
export function isUndoableOpKind(op: JournalOp): boolean {
  switch (op) {
    case 'commit':
    case 'reset':
    case 'checkout':
    case 'branch-create':
    case 'branch-delete':
    case 'branch-rename':
    case 'stash-push':
    case 'stash-drop':
      return true;
    case 'merge':
    case 'rebase':
    case 'cherry-pick':
    case 'revert':
    case 'push':
    case 'discard':
    case 'stage':
    case 'unstage':
    case 'tag-create':
    case 'worktree-add':
    case 'fetch':
    case 'pull':
    case 'abort':
    case 'continue':
    case 'stash-store':
    case 'conflict-resolve-whole-file':
    case 'conflict-apply-hunk':
      return false;
    default: {
      const exhaustive: never = op;
      throw new Error(`Unclassified journal op: ${String(exhaustive)}`);
    }
  }
}

/**
 * The one-line reason shown on an un-undoable entry, never a disabled button
 * with nothing said. `undefined` for an op `isUndoableOpKind` calls undoable —
 * callers should not be asking for a reason there.
 */
export function undoReason(op: JournalOp): string | undefined {
  switch (op) {
    case 'commit':
    case 'reset':
    case 'checkout':
    case 'branch-create':
    case 'branch-delete':
    case 'branch-rename':
    case 'stash-push':
    case 'stash-drop':
      return undefined;
    case 'merge':
      return 'Merges can bring in more than one branch of history — undo it with a deliberate reset, not a one-click button.';
    case 'rebase':
      return 'A rebase replays a whole run of commits — undo it with a deliberate reset, not a one-click button.';
    case 'cherry-pick':
      return 'A cherry-pick can conflict like a merge — undo it with a deliberate reset, not a one-click button.';
    case 'revert':
      return 'Revert is a sequencer operation like merge and rebase — undo it with a deliberate reset, not a one-click button.';
    case 'push':
      return 'This changed a remote branch, not just a local one — push again deliberately if you want to change it back.';
    case 'discard':
      return 'Discarded changes are gone — there is no reflog for the working tree, only for refs.';
    case 'stage':
    case 'unstage':
      return 'This only changed the index, not a ref — there is nothing here for a ref-based undo to move.';
    case 'tag-create':
      return 'Tag undo is not wired up yet — delete the tag from the sidebar if you want it gone.';
    case 'worktree-add':
      return 'Worktree undo is not wired up yet — remove it from the sidebar if you want it gone.';
    case 'fetch':
      return 'Fetch only updates remote-tracking refs — nothing local moved.';
    case 'pull':
      return 'A pull can merge, rebase or fast-forward depending on your settings — use the reflog to go back.';
    case 'abort':
    case 'continue':
      return 'Part of resolving an in-progress operation, not an undoable step on its own.';
    case 'stash-store':
      return 'This is itself an undo — drop the stash again from the sidebar if you want it gone.';
    case 'conflict-resolve-whole-file':
    case 'conflict-apply-hunk':
      return 'This only changed the index, not a ref — there is nothing here for a ref-based undo to move.';
    default: {
      const exhaustive: never = op;
      throw new Error(`Unclassified journal op: ${String(exhaustive)}`);
    }
  }
}

/**
 * Whether ONE entry can actually be undone — `isUndoableOpKind` narrowed by
 * whatever anchor this particular write managed to capture.
 *
 * Most ops need `headBefore` (the sha to reset back to); `branch-create`'s
 * undo is a delete by name, so it needs `refBefore` instead; `branch-rename`'s
 * undo renames back, so it needs BOTH `refBefore` (the old name) and
 * `headAfter` (repurposed to carry the new name a plain rename has no sha
 * for, rather than growing the entry a tenth field for one op); `stash-push`'s
 * undo is `stash pop`, which needs neither sha nor ref (the stash is applied
 * by being the newest entry), so it stays undoable as long as the op
 * succeeded at all.
 *
 * `headAfter` is optional on the anchor — every caller but `branch-rename`'s
 * can omit it exactly as before.
 */
export function computeUndoable(
  op: JournalOp,
  anchor: { headBefore: string | null; refBefore: string | null; headAfter?: string | null },
): boolean {
  if (!isUndoableOpKind(op)) return false;
  if (op === 'branch-create') return anchor.refBefore != null;
  if (op === 'branch-rename') return anchor.refBefore != null && anchor.headAfter != null;
  if (op === 'stash-push') return true;
  return anchor.headBefore != null;
}

/** The reason a specific ENTRY has no undo — the op-kind reason, falling
 *  back to "its anchor was not captured" when the kind is undoable but this
 *  instance is not. */
export function entryUndoReason(entry: Pick<OpJournalEntry, 'op' | 'undoable'>): string | undefined {
  if (entry.undoable) return undefined;
  return (
    undoReason(entry.op) ??
    'This write did not capture enough to undo it — nothing here for a ref-based undo to move back to.'
  );
}

/** Default cap on how many entries the journal keeps, per repository. */
export const JOURNAL_ENTRY_CAP = 300;

/**
 * Append one entry, newest first, evicting the oldest past `cap`.
 *
 * A pure function rather than a store method so it can be unit-tested
 * without zustand or a DOM — the renderer's persisted store (Phase 22 Theme
 * H, `store/ops-journal-store.ts`) is a thin wrapper around exactly this.
 */
export function appendJournalEntry(
  existing: readonly OpJournalEntry[],
  entry: OpJournalEntry,
  cap: number = JOURNAL_ENTRY_CAP,
): OpJournalEntry[] {
  return [entry, ...existing].slice(0, Math.max(0, cap));
}
