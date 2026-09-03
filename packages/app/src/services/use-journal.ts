import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { GitOpResult, JournalOp, OpJournalEntry } from '@midnite/studio-shared';

import { useToasts } from '../components/toast-host';
import { useOpsJournalStore } from '../store/ops-journal-store';
import { bridge } from './bridge';
import { keys } from './queries';

/**
 * Every `JournalOp` `isUndoableOpKind` calls undoable in principle, now with a
 * REAL, end-to-end wired Undo action — the rest of Phase 22 Theme H's starter
 * subset (`stash-drop`/`branch-delete` shipped first). Kept deliberately
 * separate from the domain fact `entry.undoable` so the schema stays honest
 * about what is undoable IN PRINCIPLE even if a future op's wiring lags
 * behind its classification, the way this set itself did until now.
 */
export const WIRED_UNDO_OPS: readonly JournalOp[] = [
  'stash-drop',
  'branch-delete',
  'commit',
  'reset',
  'checkout',
  'branch-create',
  'branch-rename',
  'stash-push',
];

/**
 * Ops worth a toast at all. Routine, frequent writes (`stage`, `fetch`,
 * `commit`) already have their own feedback — the status bar's op-progress
 * chip, the Changes view's own state — and a toast on every one of them would
 * be noise the user tunes out right before the one that mattered. This set is
 * the ops that change or discard something in a way worth a standalone
 * notice, whether or not they end up with a working Undo button.
 */
const TOAST_OPS: ReadonlySet<JournalOp> = new Set([
  'reset',
  'discard',
  'checkout',
  'branch-delete',
  'branch-rename',
  'merge',
  'rebase',
  'cherry-pick',
  'revert',
  'stash-drop',
  'stash-push',
]);

export const shouldToastOp = (op: JournalOp): boolean => TOAST_OPS.has(op);

/** Strip `refs/heads/` — every call site here deals only in local branches. */
const shortBranchName = (fullName: string): string => fullName.replace(/^refs\/heads\//, '');

/**
 * The reverse write for one wired op.
 *
 * `commit`/`reset` both reverse with a plain `mixed` reset to `headBefore` —
 * mixed rather than hard, deliberately: it moves HEAD and the index back but
 * leaves the working tree alone, so anything touched since the original write
 * survives the undo instead of being silently discarded by a `hard` this
 * button never asked for. `checkout`'s reverse detaches at the sha HEAD used
 * to be at rather than trying to recall which branch that was — every
 * checkout call site across the app captures only a sha (see
 * `services/use-status.ts`'s default anchor), and a detached-but-correct
 * position beats guessing a branch name from nothing. `branch-delete`/
 * `branch-create` and `stash-drop`/`stash-store` are exact mirrors of each
 * other, except `branch-create`'s own reverse steps off the branch first
 * when it was checked out on creation (every call site does this) — git
 * refuses to delete the branch you are on regardless of `force`.
 * `branch-rename` reverses the two names its own `journalHint`
 * captured (`use-graph-actions.ts`). `stash-push`'s reverse is `stash pop`
 * against the newest entry, matching the same "applied by being the newest"
 * assumption `computeUndoable` already documents for it — nothing here
 * anchors a specific stash if another push interleaved, exactly as today.
 *
 * None of these can orphan a commit outright the way the doc's blast-radius
 * confirm exists for: the closest, `reset`'s and `commit`'s undo, only ever
 * moves a ref back to a sha this app itself just saw as `HEAD`, so nothing
 * gets more orphaned than the forward write already risked.
 */
async function executeUndo(entry: OpJournalEntry): Promise<GitOpResult> {
  const api = bridge();
  if (!api) return { ok: false, kind: 'error', message: 'The app bridge is unavailable.' };
  const ctx = { repoId: entry.repoId, ...(entry.worktreePath ? { worktreePath: entry.worktreePath } : {}) };
  const noAnchor: GitOpResult = { ok: false, kind: 'error', message: 'Nothing was captured to restore.' };

  switch (entry.op) {
    case 'stash-drop': {
      if (entry.headBefore == null) return noAnchor;
      return api.stash.store({ ...ctx, sha: entry.headBefore, message: entry.label });
    }
    case 'branch-delete': {
      if (entry.headBefore == null || entry.refBefore == null) return noAnchor;
      return api.ops.branchCreate({
        ...ctx,
        name: shortBranchName(entry.refBefore),
        startPoint: entry.headBefore,
        checkout: false,
      });
    }
    case 'commit':
    case 'reset': {
      if (entry.headBefore == null) return noAnchor;
      return api.ops.reset({ ...ctx, target: entry.headBefore, mode: 'mixed' });
    }
    case 'checkout': {
      if (entry.headBefore == null) return noAnchor;
      return api.ops.checkout({ ...ctx, target: entry.headBefore, detach: true });
    }
    case 'branch-create': {
      if (entry.refBefore == null) return noAnchor;
      const name = shortBranchName(entry.refBefore);
      /*
       * Every `branch-create` call site in the app passes `checkout: true`,
       * so the branch being undone is usually the one HEAD is on right now —
       * and git refuses to delete the branch you are on, `force` included.
       * `headBefore` carries the sha it was created FROM (the hint below), so
       * stepping off it there first — detached, the same shape `checkout`'s
       * own undo already uses — is what actually lets the delete land instead
       * of failing with a git error the toast cannot explain usefully.
       */
      if (entry.headBefore != null) {
        const stepOff = await api.ops.checkout({ ...ctx, target: entry.headBefore, detach: true });
        if (!stepOff.ok) return stepOff;
      }
      return api.ops.branchDelete({ ...ctx, name, force: true });
    }
    case 'branch-rename': {
      if (entry.refBefore == null || entry.headAfter == null) return noAnchor;
      return api.ops.branchRename({
        ...ctx,
        from: entry.headAfter,
        to: shortBranchName(entry.refBefore),
      });
    }
    case 'stash-push': {
      return api.stash.pop({ ...ctx, selector: 'stash@{0}' });
    }
    default:
      return { ok: false, kind: 'error', message: 'Undo is not wired up for this operation yet.' };
  }
}

/** The op recorded for the undo action itself — the forward-write primitive
 *  that actually ran, never a synthetic "undo" value. Falls back to the
 *  original op id where the reverse write has no better-fitting one of its
 *  own (`branch-rename`'s reverse is still a rename; `stash-push`'s reverse
 *  is a pop, which `JOURNAL_OPS` has no dedicated id for). */
function undoOpFor(op: JournalOp): JournalOp {
  if (op === 'stash-drop') return 'stash-store';
  if (op === 'branch-delete') return 'branch-create';
  if (op === 'branch-create') return 'branch-delete';
  if (op === 'commit') return 'reset';
  return op;
}

/**
 * Run one entry's undo, record it as its own journal entry, and invalidate
 * the repo — the doc's "undo is itself a new forward write, itself
 * journalled, itself visible in the History view" (see the shared domain
 * module's header comment for why it is never a reflog rewrite).
 */
export function useUndoJournalEntry() {
  const client = useQueryClient();
  const record = useOpsJournalStore((s) => s.record);
  const toasts = useToasts();

  return useCallback(
    async (entry: OpJournalEntry): Promise<GitOpResult> => {
      const result = await executeUndo(entry);

      if (result.ok) {
        record({
          id: crypto.randomUUID(),
          repoId: entry.repoId,
          ...(entry.worktreePath ? { worktreePath: entry.worktreePath } : {}),
          op: undoOpFor(entry.op),
          label: `Undo: ${entry.label}`,
          at: Date.now(),
          // The undo's own OWN before/after aren't ref-shaped the same way —
          // see the schema's field doc — and re-undoing an undo is out of
          // scope for this pass, so this entry is recorded as itself
          // un-undoable rather than implying a button that isn't there.
          headBefore: null,
          headAfter: entry.headBefore,
          refBefore: entry.refBefore,
          undoable: false,
        });
        toasts.show({ message: `Undone — ${entry.label}` });
        await client.invalidateQueries({ queryKey: keys.repo(entry.repoId) });
      } else if (result.kind === 'error') {
        toasts.show({ message: result.message, danger: true });
      }

      return result;
    },
    [client, record, toasts],
  );
}
