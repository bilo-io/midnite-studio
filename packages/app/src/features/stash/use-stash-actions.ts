import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { OpJournalEntry, StashDropResult } from '@midnite/studio-shared';
import { computeUndoable } from '@midnite/studio-shared';

import { useToasts } from '../../components/toast-host';
import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import { shouldToastOp, useUndoJournalEntry, WIRED_UNDO_OPS } from '../../services/use-journal';
import { useActiveWorktree, type StatusTarget } from '../../services/use-status';
import { useOpsJournalStore } from '../../store/ops-journal-store';

/**
 * Stash actions carrying Phase 22 Theme H's journal + toast wiring — the
 * reusable surface for Theme B's sidebar `stashMenu` (per the phase doc's
 * "Files this phase touches" table, this exact path is where that menu's
 * `drop` handler is meant to call into).
 *
 * Theme B (the sidebar Stashes section, its row menu, the graph pseudo-rows,
 * the inspector) has NOT landed in this checkout, despite the phase doc
 * marking it done — there is today no menu item anywhere in the renderer
 * that calls `drop`. This hook exists so the write + journal + undo path is
 * real and tested (`use-stash-actions.test.ts`, plus `git-engine`'s
 * `stashStore` integration test for the write itself) even though nothing
 * currently triggers it from the UI. `stashPush`/`stashApply`/`stashPop`/
 * `stashBranch` are left for whichever pass builds that menu, since only
 * `drop` has a wired undo in this one.
 *
 * Mirrors `useTargetedGitOp` in `services/use-status.ts` rather than reusing
 * it directly: that hook is typed over `GitOpId` (never `StashDropResult`'s
 * widened `recoveredSha` arm), and stash is its own small IPC group for the
 * same reason `commands/stash.ts` keeps reads and writes in one module. A
 * later pass that finds itself duplicating a THIRD such wrapper should
 * probably generalise the two rather than write a third.
 */
export function useTargetedStashDrop({ repoId, worktreePath }: StatusTarget) {
  const client = useQueryClient();
  const record = useOpsJournalStore((s) => s.record);
  const toasts = useToasts();
  const undo = useUndoJournalEntry();

  return useMutation<StashDropResult, never, { selector: string; message: string }>({
    mutationKey: ['stash-op', 'drop'],
    mutationFn: async (args) => {
      const api = bridge();
      if (!api || !repoId) {
        return { ok: false, kind: 'error', message: 'No repository selected.' };
      }
      const ctx = { repoId, ...(worktreePath ? { worktreePath } : {}) };
      const result = await api.stash.drop({ ...ctx, selector: args.selector });

      if (result.ok) {
        const headBefore = result.recoveredSha ?? null;
        const entry: OpJournalEntry = {
          id: crypto.randomUUID(),
          repoId,
          ...(worktreePath ? { worktreePath } : {}),
          op: 'stash-drop',
          label: `Dropped stash: ${args.message}`,
          at: Date.now(),
          headBefore,
          headAfter: null,
          refBefore: null,
          undoable: computeUndoable('stash-drop', { headBefore, refBefore: null }),
        };
        record(entry);

        if (shouldToastOp('stash-drop')) {
          const wired = WIRED_UNDO_OPS.includes('stash-drop') && entry.undoable;
          toasts.show({
            message: entry.label,
            danger: !entry.undoable,
            ...(wired ? { action: { label: 'Undo', onAction: () => void undo(entry) } } : {}),
          });
        }
      }

      return result;
    },
    onSettled: async () => {
      if (repoId) await client.invalidateQueries({ queryKey: keys.repo(repoId) });
    },
  });
}

export function useStashDrop() {
  return useTargetedStashDrop(useActiveWorktree());
}
