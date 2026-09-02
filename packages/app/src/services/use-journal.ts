import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { GitOpResult, JournalOp, OpJournalEntry } from '@midnite/studio-shared';

import { useToasts } from '../components/toast-host';
import { useOpsJournalStore } from '../store/ops-journal-store';
import { bridge } from './bridge';
import { keys } from './queries';

/**
 * The starter subset of Phase 22 Theme H's undo: two ops with a REAL,
 * end-to-end wired Undo action. Every other `JournalOp` is still classified
 * correctly by `computeUndoable`/`isUndoableOpKind` (shared/domain/journal.ts)
 * and gets a journal entry — this list is purely about which entries get a
 * live button in the toast/History view, kept deliberately separate from the
 * domain fact `entry.undoable` so the schema stays honest about what is
 * undoable IN PRINCIPLE even while the UI wiring lags behind it.
 */
export const WIRED_UNDO_OPS: readonly JournalOp[] = ['stash-drop', 'branch-delete'];

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
 * The reverse write for one wired op. Neither of the two ever orphans a
 * commit — `stash store` only ever ADDS a stash entry back, and recreating a
 * branch at a sha it already pointed to is purely additive — so neither needs
 * the blast-radius confirm the doc asks undo to inherit "when it would
 * orphan commits"; that case simply does not arise for this starter pair.
 */
async function executeUndo(entry: OpJournalEntry): Promise<GitOpResult> {
  const api = bridge();
  if (!api) return { ok: false, kind: 'error', message: 'The app bridge is unavailable.' };
  const ctx = { repoId: entry.repoId, ...(entry.worktreePath ? { worktreePath: entry.worktreePath } : {}) };

  switch (entry.op) {
    case 'stash-drop': {
      if (entry.headBefore == null) {
        return { ok: false, kind: 'error', message: 'Nothing was captured to restore.' };
      }
      return api.stash.store({ ...ctx, sha: entry.headBefore, message: entry.label });
    }
    case 'branch-delete': {
      if (entry.headBefore == null || entry.refBefore == null) {
        return { ok: false, kind: 'error', message: 'Nothing was captured to restore.' };
      }
      return api.ops.branchCreate({
        ...ctx,
        name: shortBranchName(entry.refBefore),
        startPoint: entry.headBefore,
        checkout: false,
      });
    }
    default:
      return { ok: false, kind: 'error', message: 'Undo is not wired up for this operation yet.' };
  }
}

/** The op recorded for the undo action itself — always the forward-write
 *  primitive that actually ran, never a synthetic "undo" value. */
function undoOpFor(op: JournalOp): JournalOp {
  if (op === 'stash-drop') return 'stash-store';
  if (op === 'branch-delete') return 'branch-create';
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
