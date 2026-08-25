import { useCallback } from 'react';

import type { GitOpResult, Ref, RepoDescriptor, StatusResult } from '@midnite/git-shared';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { validateRefName } from '../../components/prompt-dialog';
import { useCloseRepo } from '../../services/queries';
import { useTargetedGitOp, type StatusTarget } from '../../services/use-status';
import { syncAffordances } from '../status/sync-availability';

/**
 * The sidebar's menus, for one repository.
 *
 * Separate from `useGraphActions` rather than shared with it, for one reason
 * that is not stylistic: every action here targets THIS repository's primary
 * checkout, while the graph acts on whichever checkout is selected. Omitting
 * `worktreePath` is what expresses that — main's `resolveWorkdir` falls back to
 * the repo root — and it is why the sidebar can check a branch out in a
 * repository the user has not even selected.
 *
 * Deliberately non-destructive. Delete and rename stay on the graph's ref
 * badges with the blast-radius gating Phase 7 built; a second, subtly different
 * set of destructive affordances over here would be a place for the two to
 * disagree. What the sidebar adds is the one thing the graph cannot say —
 * "make this the primary checkout of that repo".
 */
/**
 * A repository's primary checkout, as a status/op target.
 *
 * Named rather than inlined because the sidebar addresses it from three places
 * — the header's status query, its sync buttons, and every action in the menus
 * — and the three sharing one target is what makes them share one `git status`
 * with the title bar instead of running a second one. The main worktree's path
 * IS the repo path, so this is the same directory `resolveWorkdir` falls back
 * to when `worktreePath` is omitted; sending it explicitly only lines the query
 * key up with the one the selected-worktree hooks use.
 */
export function primaryTarget(repo: RepoDescriptor): StatusTarget {
  const main = repo.worktrees.find((worktree) => worktree.isMain);
  return { repoId: repo.id, ...(main ? { worktreePath: main.path } : {}) };
}

export function useRepoActions(repo: RepoDescriptor, onError: (message: string) => void) {
  const dialogs = useDialogs();
  const close = useCloseRepo();

  const target = primaryTarget(repo);

  const checkout = useTargetedGitOp<{ target: string; detach?: boolean }>(target, (api, args, ctx) =>
    api.ops.checkout({ ...ctx, target: args.target, detach: args.detach ?? false }),
  );
  const branchCreate = useTargetedGitOp<{ name: string; startPoint: string }>(
    target,
    (api, args, ctx) => api.ops.branchCreate({ ...ctx, ...args, checkout: true }),
  );
  const fetch = useTargetedGitOp<void>(target, (api, _args, ctx) => api.ops.fetch({ ...ctx }));
  const pull = useTargetedGitOp<void>(target, (api, _args, ctx) => api.ops.pull({ ...ctx }));
  const push = useTargetedGitOp<{ setUpstream: boolean }>(target, (api, args, ctx) =>
    api.ops.push({ ...ctx, setUpstream: args.setUpstream }),
  );

  const report = useCallback(
    (result: GitOpResult) => {
      // A conflict is not an error message — the conflict banner takes over and
      // says everything that needs saying, with the way out attached.
      onError(result.ok || result.kind !== 'error' ? '' : result.message);
    },
    [onError],
  );

  /**
   * "Switch the primary checkout to this branch", as a menu item.
   *
   * The disabled reasons are the whole value of the item: git refuses to check
   * one branch out into two worktrees, and a greyed row with no explanation is
   * indistinguishable from a bug.
   */
  const checkoutItem = useCallback(
    (ref: Ref): MenuItem => ({
      label: `Switch primary checkout to ${ref.name}`,
      disabled: ref.isHead || ref.worktreePath !== null,
      disabledReason: ref.isHead
        ? 'Already the primary checkout.'
        : `Checked out in ${ref.worktreePath} — a branch can only be checked out once.`,
      onSelect: () => void checkout.mutateAsync({ target: ref.name }).then(report),
    }),
    [checkout, report],
  );

  /** Right-click on a branch, remote branch or tag row. */
  const refMenu = useCallback(
    (ref: Ref): MenuItem[] => {
      if (ref.kind === 'localBranch') {
        return [checkoutItem(ref), { type: 'separator' }, copyItem('branch name', ref.name)];
      }

      if (ref.kind === 'remoteBranch') {
        return [
          {
            // Not a plain checkout: `git checkout origin/x` lands on a detached
            // HEAD, which is never what clicking a remote branch means. A local
            // branch starting there is.
            label: `Create local branch from ${ref.name}…`,
            onSelect: () =>
              dialogs.prompt({
                title: `New branch from ${ref.name}`,
                label: 'Branch name',
                initialValue: shortRemoteName(ref.name),
                confirmLabel: 'Create and check out',
                validate: validateRefName,
                onConfirm: (name) =>
                  void branchCreate.mutateAsync({ name, startPoint: ref.name }).then(report),
              }),
          },
          { type: 'separator' },
          copyItem('branch name', ref.name),
        ];
      }

      return [
        {
          label: `Check out ${ref.name} (detached)`,
          onSelect: () =>
            void checkout.mutateAsync({ target: ref.name, detach: true }).then(report),
        },
        { type: 'separator' },
        copyItem('tag name', ref.name),
      ];
    },
    [branchCreate, checkout, checkoutItem, dialogs, report],
  );

  /** Right-click on the repository header, and its ellipsis button. */
  const repoMenu = useCallback(
    (refs: readonly Ref[], status: StatusResult | undefined): MenuItem[] => {
      const sync = status ? syncAffordances(status.branch) : null;
      const syncItem = (
        op: 'fetch' | 'pull' | 'push',
        run: () => Promise<GitOpResult>,
      ): MenuItem => ({
        label: sync?.[op].label ?? op,
        disabled: !sync?.[op].enabled,
        disabledReason: sync?.[op].reason ?? 'Reading the repository…',
        onSelect: () => void run().then(report),
      });

      // Only branches that CAN become the primary checkout, and only as many as
      // a menu can show without becoming a list to scroll. The Local section
      // below is the complete one — this is the shortcut, not a replacement.
      const switchable = refs.filter(
        (ref) => ref.kind === 'localBranch' && !ref.isHead && ref.worktreePath === null,
      );
      const shown = switchable.slice(0, CHECKOUT_MENU_LIMIT);

      return [
        syncItem('fetch', () => fetch.mutateAsync()),
        syncItem('pull', () => pull.mutateAsync()),
        syncItem('push', () =>
          push.mutateAsync({ setUpstream: status?.branch.upstream == null }),
        ),
        { type: 'separator' },
        {
          label: 'Switch primary checkout to',
          disabled: shown.length === 0,
          disabledReason:
            switchable.length === 0 && refs.length > 0
              ? 'No other local branch is free to check out.'
              : 'Expand the repository to load its branches.',
          submenu: shown.map((ref) => ({
            label: ref.name,
            onSelect: () => void checkout.mutateAsync({ target: ref.name }).then(report),
          })),
        },
        { type: 'separator' },
        copyItem('path', repo.path),
        {
          label: `Close ${repo.name}`,
          danger: true,
          // Closing forgets the repo; it never touches the working tree, so
          // there is nothing to confirm and nothing to lose.
          onSelect: () => close.mutate(repo.id),
        },
      ];
    },
    [checkout, close, fetch, pull, push, repo.id, repo.name, repo.path, report],
  );

  return { refMenu, repoMenu, checkout, report };
}

/** Past this the submenu is a list that wants scrolling, which menus don't do. */
const CHECKOUT_MENU_LIMIT = 12;

/**
 * `origin/feat/x` → `feat/x`: the local branch name git itself would pick.
 */
const shortRemoteName = (name: string): string => name.slice(name.indexOf('/') + 1);

/**
 * Copy to the clipboard, or quietly do nothing.
 *
 * `navigator.clipboard` is unavailable in a non-secure or headless context, and
 * a menu item is not the place to raise an error about the clipboard API.
 */
const copyItem = (what: string, value: string): MenuItem => ({
  label: `Copy ${what}`,
  onSelect: () => void navigator.clipboard?.writeText(value).catch(() => undefined),
});
