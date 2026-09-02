import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { GitOpResult, OpJournalEntry, StashDropResult } from '@midnite/studio-shared';
import { computeUndoable } from '@midnite/studio-shared';

import { useToasts } from '../../components/toast-host';
import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import { shouldToastOp, useUndoJournalEntry, WIRED_UNDO_OPS } from '../../services/use-journal';
import { useActiveWorktree, type StatusTarget } from '../../services/use-status';
import { useOpsJournalStore } from '../../store/ops-journal-store';

/**
 * Stash actions carrying Phase 22 Theme H's journal + toast wiring — the
 * reusable surface Theme B's sidebar `stashMenu` and heading action call
 * into (`use-repo-actions.ts`).
 *
 * Mirrors `useTargetedGitOp` in `services/use-status.ts` rather than reusing
 * it directly: that hook is typed over `GitOpId` (never `StashDropResult`'s
 * widened `recoveredSha` arm), and stash is its own small IPC group for the
 * same reason `commands/stash.ts` keeps reads and writes in one module. A
 * later pass that finds itself duplicating a THIRD such wrapper should
 * probably generalise the two rather than write a third.
 *
 * Only `push` and `drop` are `JournalOp`s (`shared/domain/journal.ts`'s own
 * `JOURNAL_OPS` list) — `apply`/`pop`/`branch` are plain mutations below,
 * with no journal entry: each already has its own git-native recovery story
 * (the stash entry stays, or lives on as a branch), so there is nothing here
 * for the app's own undo journal to add.
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

export type StashPushArgs = {
  message?: string;
  keepIndex?: boolean;
  includeUntracked?: boolean;
  paths?: string[];
};

/** `git stash push` — the sidebar heading action (Theme B) and the Changes
 *  view's scoped stash (Theme E) both call this. */
export function useTargetedStashPush({ repoId, worktreePath }: StatusTarget) {
  const client = useQueryClient();
  const record = useOpsJournalStore((s) => s.record);
  const toasts = useToasts();

  return useMutation<GitOpResult, never, StashPushArgs>({
    mutationKey: ['stash-op', 'push'],
    mutationFn: async (args) => {
      const api = bridge();
      if (!api || !repoId) {
        return { ok: false, kind: 'error', message: 'No repository selected.' };
      }
      const ctx = { repoId, ...(worktreePath ? { worktreePath } : {}) };
      const result = await api.stash.push({ ...ctx, ...args });

      if (result.ok) {
        const label = args.message ? `Stashed: ${args.message}` : 'Stashed changes';
        const entry: OpJournalEntry = {
          id: crypto.randomUUID(),
          repoId,
          ...(worktreePath ? { worktreePath } : {}),
          op: 'stash-push',
          label,
          at: Date.now(),
          headBefore: null,
          headAfter: null,
          refBefore: null,
          undoable: computeUndoable('stash-push', { headBefore: null, refBefore: null }),
        };
        record(entry);
        // Not in `WIRED_UNDO_OPS` — the toast shows (Theme B/E's own write is
        // worth a notice), but with no Undo action, same as every other
        // `JournalOp` this starter subset has not wired a live button for.
        if (shouldToastOp('stash-push')) toasts.show({ message: entry.label });
      }

      return result;
    },
    onSettled: async () => {
      if (repoId) await client.invalidateQueries({ queryKey: keys.repo(repoId) });
    },
  });
}

export function useStashPush() {
  return useTargetedStashPush(useActiveWorktree());
}

/**
 * `apply`/`pop`/`branch` — plain mutations, no journal entry: none of the
 * three is a `JournalOp` (`shared/domain/journal.ts`'s own list), because
 * each already has its own recovery story outside the app's undo journal —
 * the stash entry itself for apply/pop, the new branch itself for branch.
 */
export function useTargetedStashApply({ repoId, worktreePath }: StatusTarget) {
  const client = useQueryClient();
  return useMutation<GitOpResult, never, { selector: string }>({
    mutationKey: ['stash-op', 'apply'],
    mutationFn: async (args) => {
      const api = bridge();
      if (!api || !repoId) return { ok: false, kind: 'error', message: 'No repository selected.' };
      return api.stash.apply({ repoId, ...(worktreePath ? { worktreePath } : {}), ...args });
    },
    onSettled: async () => {
      if (repoId) await client.invalidateQueries({ queryKey: keys.repo(repoId) });
    },
  });
}

export function useTargetedStashPop({ repoId, worktreePath }: StatusTarget) {
  const client = useQueryClient();
  return useMutation<GitOpResult, never, { selector: string }>({
    mutationKey: ['stash-op', 'pop'],
    mutationFn: async (args) => {
      const api = bridge();
      if (!api || !repoId) return { ok: false, kind: 'error', message: 'No repository selected.' };
      return api.stash.pop({ repoId, ...(worktreePath ? { worktreePath } : {}), ...args });
    },
    onSettled: async () => {
      if (repoId) await client.invalidateQueries({ queryKey: keys.repo(repoId) });
    },
  });
}

export function useTargetedStashBranch({ repoId, worktreePath }: StatusTarget) {
  const client = useQueryClient();
  return useMutation<GitOpResult, never, { name: string; selector: string }>({
    mutationKey: ['stash-op', 'branch'],
    mutationFn: async (args) => {
      const api = bridge();
      if (!api || !repoId) return { ok: false, kind: 'error', message: 'No repository selected.' };
      return api.stash.branch({ repoId, ...(worktreePath ? { worktreePath } : {}), ...args });
    },
    onSettled: async () => {
      if (repoId) await client.invalidateQueries({ queryKey: keys.repo(repoId) });
    },
  });
}
