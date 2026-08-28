import { useCallback } from 'react';
import type { GitOpResult, StashDropResult, StashEntry } from '@midnite/git-shared';
import { Copy, GitBranch, Play, Trash2 } from 'lucide-react';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { validateRefName } from '../../components/prompt-dialog';
import { useTargetedGitOp } from '../../services/use-status';

export function useStashActions(
  repoId: string,
  worktreePath: string | undefined,
  onError: (message: string) => void,
) {
  const dialogs = useDialogs();
  const target = { repoId, ...(worktreePath ? { worktreePath } : {}) };

  const apply = useTargetedGitOp<{ selector: string }>(target, 'stash-apply', (api, args, ctx) =>
    api.stash.apply({ ...ctx, selector: args.selector }),
  );
  const pop = useTargetedGitOp<{ selector: string }>(target, 'stash-pop', (api, args, ctx) =>
    api.stash.pop({ ...ctx, selector: args.selector }),
  );
  const drop = useTargetedGitOp<{ selector: string }, StashDropResult>(
    target,
    'stash-drop',
    (api, args, ctx) => api.stash.drop({ ...ctx, selector: args.selector }),
  );
  const branch = useTargetedGitOp<{ name: string; selector: string }>(
    target,
    'stash-branch',
    (api, args, ctx) => api.stash.branch({ ...ctx, name: args.name, selector: args.selector }),
  );

  const report = useCallback(
    (result: GitOpResult | StashDropResult) => {
      onError(result.ok || result.kind !== 'error' ? '' : result.message);
    },
    [onError],
  );

  const promptBranchFromStash = useCallback(
    (entry: StashEntry) => {
      dialogs.prompt({
        title: `Branch from ${entry.selector}`,
        label: 'Branch name',
        confirmLabel: 'Create branch',
        validate: validateRefName,
        onConfirm: (name) => {
          void branch.mutateAsync({ name, selector: entry.selector }).then(report);
        },
      });
    },
    [branch, dialogs, report],
  );

  const confirmDrop = useCallback(
    (entry: StashEntry) => {
      dialogs.confirm({
        title: `Drop ${entry.selector}?`,
        body: `Are you sure you want to drop "${entry.message}"? This removes the stash from the list.`,
        confirmLabel: 'Drop stash',
        danger: true,
        blastRadius: null,
        onConfirm: () => {
          void drop.mutateAsync({ selector: entry.selector }).then(report);
        },
      });
    },
    [dialogs, drop, report],
  );

  const stashMenu = useCallback(
    (entry: StashEntry): MenuItem[] => [
      {
        label: 'Apply stash',
        icon: Play,
        onSelect: () => void apply.mutateAsync({ selector: entry.selector }).then(report),
      },
      {
        label: 'Pop stash',
        icon: Play,
        onSelect: () => void pop.mutateAsync({ selector: entry.selector }).then(report),
      },
      {
        label: 'Branch from stash…',
        icon: GitBranch,
        onSelect: () => promptBranchFromStash(entry),
      },
      { type: 'separator' },
      {
        label: 'Copy commit SHA',
        icon: Copy,
        onSelect: () => void navigator.clipboard?.writeText(entry.sha).catch(() => undefined),
      },
      { type: 'separator' },
      {
        label: `Drop ${entry.selector}…`,
        icon: Trash2,
        danger: true,
        onSelect: () => confirmDrop(entry),
      },
    ],
    [apply, confirmDrop, pop, promptBranchFromStash, report],
  );

  return {
    apply,
    pop,
    drop,
    branch,
    promptBranchFromStash,
    confirmDrop,
    stashMenu,
  };
}
