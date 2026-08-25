import { useCallback } from 'react';

import type { GitOpResult, GraphRow, Ref } from '@midnite-git/shared';

import { useDialogs } from '../../components/dialog-host';
import { validateRefName } from '../../components/prompt-dialog';
import type { MenuItem } from '../../components/context-menu';
import { bridge } from '../../services/bridge';
import { useActiveWorktree, useGitOp } from '../../services/use-status';

/**
 * The commit-row and branch-badge context menus.
 *
 * Menu construction lives here rather than in the row component so the rows
 * stay cheap to re-render (they re-render on every 500-row streaming batch) and
 * so the same actions can later be reached from a command palette without
 * duplicating any of this.
 */
export function useGraphActions(onError: (message: string) => void) {
  const dialogs = useDialogs();
  const { repoId, worktreePath } = useActiveWorktree();

  const checkout = useGitOp<{ target: string; detach?: boolean }>((api, args, ctx) =>
    api.ops.checkout({ ...ctx, target: args.target, detach: args.detach ?? false }),
  );
  const branchCreate = useGitOp<{ name: string; startPoint: string; checkout: boolean }>(
    (api, args, ctx) => api.ops.branchCreate({ ...ctx, ...args }),
  );
  const branchDelete = useGitOp<{ name: string; force: boolean }>((api, args, ctx) =>
    api.ops.branchDelete({ ...ctx, ...args }),
  );
  const branchRename = useGitOp<{ from: string; to: string }>((api, args, ctx) =>
    api.ops.branchRename({ ...ctx, ...args }),
  );
  const tagCreate = useGitOp<{ name: string; target: string }>((api, args, ctx) =>
    api.ops.tagCreate({ ...ctx, ...args }),
  );
  const resetTo = useGitOp<{ target: string; mode: 'soft' | 'mixed' | 'hard' }>((api, args, ctx) =>
    api.ops.reset({ ...ctx, ...args }),
  );

  const report = useCallback(
    (result: GitOpResult) => {
      if (result.ok) onError('');
      else if (result.kind === 'error') onError(result.message);
      else onError(`Conflicts in ${result.files.length} file(s).`);
    },
    [onError],
  );

  /**
   * Count what an operation would orphan, then fill it into the open dialog.
   *
   * Asynchronous on purpose: `rev-list --count` on a big repo takes long enough
   * to be felt, and blocking the dialog on it would make every destructive
   * action feel broken. The dialog opens immediately showing "checking…" and
   * the number lands when it lands.
   */
  const withBlastRadius = useCallback(
    (query: { from: string; to?: string; movingRef?: string }) => {
      if (!repoId) return;
      void bridge()
        ?.ops.blastRadius({ repoId, ...query, ...(worktreePath ? { worktreePath } : {}) })
        .then((radius) => dialogs.setBlastRadius(radius))
        .catch(() => dialogs.setBlastRadius(null));
    },
    [dialogs, repoId, worktreePath],
  );

  /** Right-click on a commit row. */
  const commitMenu = useCallback(
    (row: GraphRow, currentBranch: string | null): MenuItem[] => {
      const sha = row.commit.sha;
      const short = sha.slice(0, 7);

      return [
        {
          label: 'Create branch here…',
          onSelect: () =>
            dialogs.prompt({
              title: `New branch at ${short}`,
              label: 'Branch name',
              confirmLabel: 'Create',
              placeholder: 'feature/my-change',
              validate: validateRefName,
              onConfirm: (name) =>
                void branchCreate.mutateAsync({ name, startPoint: sha, checkout: true }).then(report),
            }),
        },
        {
          label: 'Create tag here…',
          onSelect: () =>
            dialogs.prompt({
              title: `New tag at ${short}`,
              label: 'Tag name',
              confirmLabel: 'Create',
              placeholder: 'v1.0.0',
              validate: validateRefName,
              onConfirm: (name) => void tagCreate.mutateAsync({ name, target: sha }).then(report),
            }),
        },
        { type: 'separator' },
        {
          label: `Checkout ${short} (detached)`,
          onSelect: () =>
            void checkout.mutateAsync({ target: sha, detach: true }).then(report),
        },
        { type: 'separator' },
        {
          label: `Reset ${currentBranch ?? 'HEAD'} to here`,
          disabled: currentBranch === null,
          disabledReason: 'HEAD is detached — there is no branch to move.',
          submenu: [
            {
              label: 'Soft — keep changes staged',
              onSelect: () => void resetTo.mutateAsync({ target: sha, mode: 'soft' }).then(report),
            },
            {
              label: 'Mixed — keep changes unstaged',
              onSelect: () => void resetTo.mutateAsync({ target: sha, mode: 'mixed' }).then(report),
            },
            {
              label: 'Hard — discard changes',
              danger: true,
              // The only menu item that can destroy uncommitted work AND
              // orphan commits, so it is the one that must never fire directly.
              onSelect: () => {
                dialogs.confirm({
                  title: `Hard reset to ${short}?`,
                  body: 'Uncommitted changes in this worktree will be discarded. There is no undo for them.',
                  confirmLabel: 'Reset (hard)',
                  danger: true,
                  blastRadius: undefined,
                  onConfirm: () =>
                    void resetTo.mutateAsync({ target: sha, mode: 'hard' }).then(report),
                });
                // The moving ref is the current branch: excluding it is what
                // makes the count "orphaned" rather than "removed from here".
                withBlastRadius({
                  from: 'HEAD',
                  to: sha,
                  ...(currentBranch ? { movingRef: `refs/heads/${currentBranch}` } : {}),
                });
              },
            },
          ],
        },
      ];
    },
    [branchCreate, checkout, dialogs, report, resetTo, tagCreate, withBlastRadius],
  );

  /** Right-click on a ref badge. */
  const refMenu = useCallback(
    (ref: Ref, currentBranch: string | null): MenuItem[] => {
      const isCurrent = ref.kind === 'localBranch' && ref.name === currentBranch;
      const elsewhere = ref.worktreePath !== null && !isCurrent;

      const items: MenuItem[] = [
        {
          label: `Checkout ${ref.name}`,
          disabled: isCurrent || elsewhere,
          disabledReason: isCurrent
            ? 'Already checked out here.'
            : 'Checked out in another worktree — a branch can only be checked out once.',
          onSelect: () => void checkout.mutateAsync({ target: ref.name }).then(report),
        },
      ];

      if (ref.kind === 'localBranch') {
        items.push(
          { type: 'separator' },
          {
            label: 'Rename…',
            onSelect: () =>
              dialogs.prompt({
                title: `Rename ${ref.name}`,
                label: 'New name',
                initialValue: ref.name,
                confirmLabel: 'Rename',
                validate: validateRefName,
                onConfirm: (to) =>
                  void branchRename.mutateAsync({ from: ref.name, to }).then(report),
              }),
          },
          {
            label: `Delete ${ref.name}`,
            danger: true,
            disabled: isCurrent,
            disabledReason: 'You cannot delete the branch you are on.',
            onSelect: () => {
              dialogs.confirm({
                title: `Delete branch ${ref.name}?`,
                body: 'The branch label is removed. Commits stay in the repository until git garbage-collects them.',
                confirmLabel: 'Delete branch',
                danger: true,
                blastRadius: undefined,
                onConfirm: () =>
                  void branchDelete
                    .mutateAsync({ name: ref.name, force: true })
                    .then(report),
              });
              // A deleted branch ends up nowhere, so there is no `to`; what
              // matters is which of its commits no OTHER ref holds.
              withBlastRadius({ from: ref.name, movingRef: ref.fullName });
            },
          },
        );
      }

      return items;
    },
    [branchDelete, branchRename, checkout, dialogs, report, withBlastRadius],
  );

  return { commitMenu, refMenu, checkoutRef: checkout, report };
}
