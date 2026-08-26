import { useCallback } from 'react';

import type {
  GitOpResult,
  Ref,
  Remote,
  RepoDescriptor,
  StatusResult,
  Worktree,
} from '@midnite/git-shared';
import { forgeProjectUrl, pickForgeRemote } from '@midnite/git-shared';

import type { MenuItem } from '../../components/context-menu';
import { useDialogs } from '../../components/dialog-host';
import { validateRefName } from '../../components/prompt-dialog';
import { bridge } from '../../services/bridge';
import { openExternal, useCloseRepo, useRemoveWorktree } from '../../services/queries';
import { useTargetedGitOp, type StatusTarget } from '../../services/use-status';
import { useUiStore } from '../../store/ui-store';
import { useWorkbenchStore } from '../../store/workbench-store';
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
 * These menus used to be deliberately non-destructive, on the grounds that
 * delete and rename belonged only to the graph's ref badges and a second set of
 * destructive affordances over here would be somewhere for the two to disagree.
 * That reasoning did not survive contact with the tree: the sidebar is where
 * branches and worktrees are actually managed, and sending someone to the graph
 * to delete a branch they are looking at is the kind of indirection a git client
 * exists to remove. The disagreement risk is answered instead by routing every
 * destructive verb through one confirm shape — blast radius where commits are
 * at stake, named warnings where they are not — so the two surfaces differ in
 * where they are, not in what they do.
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

export type RepoActionContext = {
  /** Per-checkout uncommitted counts, so a confirm can say what is at stake. */
  changedByWorktree: ReadonlyMap<string, number>;
  remotes: readonly Remote[];
};

export function useRepoActions(
  repo: RepoDescriptor,
  onError: (message: string) => void,
  context: RepoActionContext,
) {
  const dialogs = useDialogs();
  const close = useCloseRepo();
  const removeWorktree = useRemoveWorktree(repo.id);
  const openTab = useWorkbenchStore((s) => s.openTab);
  const setActiveView = useUiStore((s) => s.setActiveView);

  const target = primaryTarget(repo);

  const checkout = useTargetedGitOp<{ target: string; detach?: boolean }>(
    target,
    (api, args, ctx) =>
      api.ops.checkout({ ...ctx, target: args.target, detach: args.detach ?? false }),
  );
  const branchCreate = useTargetedGitOp<{ name: string; startPoint: string }>(
    target,
    (api, args, ctx) => api.ops.branchCreate({ ...ctx, ...args, checkout: true }),
  );
  const branchDelete = useTargetedGitOp<{ name: string; force: boolean }>(
    target,
    (api, args, ctx) => api.ops.branchDelete({ ...ctx, ...args }),
  );
  const branchRename = useTargetedGitOp<{ from: string; to: string }>(target, (api, args, ctx) =>
    api.ops.branchRename({ ...ctx, ...args }),
  );
  const worktreeAdd = useTargetedGitOp<{ path: string; branch: string; createBranch: boolean }>(
    target,
    (api, args, ctx) => api.repos.worktreeAdd({ repoId: ctx.repoId, ...args }),
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

  /** Open a checkout's whole diff as a workbench tab. */
  const viewAllChanges = useCallback(
    (worktreePath: string, label: string) => {
      openTab({ kind: 'all-changes', repoId: repo.id, worktreePath, label });
      // The tab lives in the Changes view, so opening one from the sidebar has
      // to go there — otherwise the click appears to do nothing at all.
      setActiveView('changes');
    },
    [openTab, repo.id, setActiveView],
  );

  /** "Open on GitHub", when the repo has a remote we can build a URL for. */
  const forgeItems = useCallback((): MenuItem[] => {
    const forge = pickForgeRemote(context.remotes)?.forge ?? null;
    const url = forge ? forgeProjectUrl(forge) : null;
    // Absent, not disabled: a local-path remote has no web page, and that is
    // permanent rather than temporarily unavailable.
    if (!forge || url === null) return [];
    return [
      { type: 'separator' },
      {
        label: `Open ${forge.owner}/${forge.repo} on ${forge.host}`,
        onSelect: () => openExternal(url),
      },
    ];
  }, [context.remotes]);

  /** Create a worktree beside the repository, in a sibling directory. */
  const promptWorktree = useCallback(
    (branch: string, createBranch: boolean) => {
      const parent = repo.path.slice(0, repo.path.lastIndexOf('/'));
      dialogs.prompt({
        title: `New worktree for ${branch}`,
        label: 'Directory',
        // A sibling of the repository, named for the branch. Nesting a worktree
        // inside the repo would put it in git's own working tree, where it
        // shows up as an untracked directory in every status.
        initialValue: `${parent}/${repo.name}-${branch.replaceAll('/', '-')}`,
        confirmLabel: 'Create worktree',
        onConfirm: (path) =>
          void worktreeAdd.mutateAsync({ path, branch, createBranch }).then(report),
      });
    },
    [dialogs, repo.name, repo.path, report, worktreeAdd],
  );

  /**
   * Remove a worktree, in two steps when git objects.
   *
   * The first attempt never passes `--force`: git's refusal to remove a
   * checkout with uncommitted work is the last thing between a stray click and
   * lost edits, and the count in the warning is there so the decision is made
   * with the number in view. Only after git has actually refused does a second,
   * separately-confirmed dialog offer to override it — so "force" is always a
   * reply to a specific objection rather than a checkbox nobody read.
   */
  const confirmRemoveWorktree = useCallback(
    (worktree: Worktree, changed: number) => {
      const label = worktree.branch ?? worktree.path;
      dialogs.confirm({
        title: `Remove worktree ${label}?`,
        body: `The directory ${worktree.path} is deleted from disk. The branch itself is not.`,
        confirmLabel: 'Remove worktree',
        danger: true,
        blastRadius: null,
        warnings:
          changed > 0
            ? [
                `${changed} uncommitted ${changed === 1 ? 'change' : 'changes'} in this checkout would be lost.`,
              ]
            : [],
        onConfirm: () => {
          void removeWorktree.mutateAsync({ path: worktree.path, force: false }).then((result) => {
            if (result.ok) return;
            report(result);
            dialogs.confirm({
              title: `Force-remove ${label}?`,
              body: 'git refused because the checkout is not clean. Removing it anyway discards that work permanently — there is no reflog for uncommitted changes.',
              confirmLabel: 'Remove anyway',
              danger: true,
              blastRadius: null,
              warnings: [result.kind === 'error' ? result.message : 'The checkout is not clean.'],
              onConfirm: () =>
                void removeWorktree.mutateAsync({ path: worktree.path, force: true }).then(report),
            });
          });
        },
      });
    },
    [dialogs, removeWorktree, report],
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

  /**
   * Delete a local branch, gated on the commits it would strand.
   *
   * `force: true` unconditionally, which looks alarming and is the honest
   * choice: git's own `-d` refuses on unmerged commits with no way to see what
   * they are, so a UI built on it can only relay a refusal. The blast radius
   * this dialog waits for is strictly better information than that refusal —
   * it names the commits — so the decision moves to the person, in front of the
   * numbers, instead of being made for them by an error message.
   */
  const deleteBranchItem = useCallback(
    (ref: Ref): MenuItem => ({
      label: `Delete ${ref.name}…`,
      danger: true,
      disabled: ref.isHead,
      disabledReason: 'You cannot delete the branch that is checked out.',
      onSelect: () => {
        dialogs.confirm({
          title: `Delete branch ${ref.name}?`,
          body: 'The branch label is removed. Any commit still reachable from another branch is untouched.',
          confirmLabel: 'Delete branch',
          danger: true,
          blastRadius: undefined,
          onConfirm: () =>
            void branchDelete.mutateAsync({ name: ref.name, force: true }).then(report),
        });
        void countBlastRadius(repo.id, { from: ref.fullName, movingRef: ref.fullName }).then(
          (radius) => dialogs.setBlastRadius(radius),
        );
      },
    }),
    [branchDelete, dialogs, repo.id, report],
  );

  /** Right-click on a branch, remote branch or tag row. */
  const refMenu = useCallback(
    (ref: Ref): MenuItem[] => {
      if (ref.kind === 'localBranch') {
        const checkoutPath = ref.worktreePath;
        return [
          checkoutItem(ref),
          {
            label: 'View all changes',
            // The button and the menu item agree on when this is possible: a
            // branch that is not checked out anywhere has no working tree to
            // read, and this phase deliberately adds no branch-vs-base diff.
            disabled: checkoutPath === null,
            disabledReason: 'This branch is not checked out, so it has no working tree to read.',
            onSelect: () => checkoutPath && viewAllChanges(checkoutPath, ref.name),
          },
          {
            label: `Rename ${ref.name}…`,
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
            label: 'Create worktree from this branch…',
            // git refuses to check one branch out twice, so a branch that
            // already lives somewhere cannot seed a second worktree.
            disabled: checkoutPath !== null,
            disabledReason: `Already checked out in ${checkoutPath}.`,
            onSelect: () => promptWorktree(ref.name, false),
          },
          { type: 'separator' },
          copyItem('branch name', ref.name),
          { type: 'separator' },
          deleteBranchItem(ref),
        ];
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
          {
            label: 'Create worktree from this branch…',
            onSelect: () => promptWorktree(shortRemoteName(ref.name), true),
          },
          { type: 'separator' },
          copyItem('branch name', ref.name),
          ...forgeItems(),
        ];
      }

      /*
        Tags get no delete.

        Not an oversight and not squeamishness: there is no `tagDelete` channel,
        and this phase does not invent one. A menu item that cannot reach an
        implementation is worse than an absent one — it looks like a bug the
        first time it is clicked.
      */
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
    [
      branchCreate,
      branchRename,
      checkout,
      checkoutItem,
      deleteBranchItem,
      dialogs,
      forgeItems,
      promptWorktree,
      report,
      viewAllChanges,
    ],
  );

  /** Right-click on a worktree row, and its hover ellipsis. */
  const worktreeMenu = useCallback(
    (worktree: Worktree): MenuItem[] => {
      const label = worktree.branch ?? worktree.path;
      const changed = context.changedByWorktree.get(worktree.path) ?? 0;

      return [
        {
          label: 'View all changes',
          disabled: changed === 0,
          disabledReason: 'This checkout has no uncommitted changes.',
          onSelect: () => viewAllChanges(worktree.path, label),
        },
        {
          label: 'Show in Folder view',
          onSelect: () => {
            useUiStore.getState().selectRepo(repo.id);
            useUiStore.getState().selectWorktree(worktree.path);
            setActiveView('files');
          },
        },
        { type: 'separator' },
        copyItem('path', worktree.path),
        { type: 'separator' },
        {
          label: `Remove worktree ${label}…`,
          danger: true,
          // git itself refuses to remove the main worktree, so offering it
          // would only ever produce an error message.
          disabled: worktree.isMain,
          disabledReason: 'The main worktree cannot be removed — close the repository instead.',
          onSelect: () => confirmRemoveWorktree(worktree, changed),
        },
      ];
    },
    [confirmRemoveWorktree, context.changedByWorktree, repo.id, setActiveView, viewAllChanges],
  );

  /** Right-click on a subsection heading, and its hover ellipsis. */
  const sectionMenu = useCallback(
    (kind: 'local' | 'remotes' | 'tags' | 'worktrees', refs: readonly Ref[]): MenuItem[] => {
      if (kind === 'worktrees') {
        const free = refs.filter(
          (ref) => ref.kind === 'localBranch' && ref.worktreePath === null && !ref.isHead,
        );
        return [
          {
            label: 'New worktree from branch',
            disabled: free.length === 0,
            disabledReason:
              refs.length === 0
                ? 'Expand the repository to load its branches.'
                : 'Every local branch is already checked out somewhere.',
            submenu: free.slice(0, CHECKOUT_MENU_LIMIT).map((ref) => ({
              label: ref.name,
              onSelect: () => promptWorktree(ref.name, false),
            })),
          },
        ];
      }

      if (kind === 'local') {
        return [
          {
            label: 'New branch…',
            onSelect: () =>
              dialogs.prompt({
                title: 'New branch',
                label: 'Branch name',
                confirmLabel: 'Create and check out',
                validate: validateRefName,
                onConfirm: (name) =>
                  void branchCreate.mutateAsync({ name, startPoint: 'HEAD' }).then(report),
              }),
          },
        ];
      }

      if (kind === 'remotes') {
        return [
          { label: 'Fetch all remotes', onSelect: () => void fetch.mutateAsync().then(report) },
          ...forgeItems(),
        ];
      }

      return [copyItem('path', repo.path)];
    },
    [branchCreate, dialogs, fetch, forgeItems, promptWorktree, repo.path, report],
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
      const main = repo.worktrees.find((worktree) => worktree.isMain);

      return [
        syncItem('fetch', () => fetch.mutateAsync()),
        syncItem('pull', () => pull.mutateAsync()),
        syncItem('push', () => push.mutateAsync({ setUpstream: status?.branch.upstream == null })),
        { type: 'separator' },
        {
          label: 'View all changes',
          disabled: main === undefined,
          disabledReason: 'This repository has no main worktree.',
          onSelect: () => main && viewAllChanges(main.path, repo.name),
        },
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
        ...forgeItems(),
        { type: 'separator' },
        {
          label: `Close ${repo.name}…`,
          danger: true,
          onSelect: () =>
            dialogs.confirm({
              title: `Close ${repo.name}?`,
              // Worth stating plainly. "Close" beside "Delete branch" in a red
              // menu reads as destructive, and someone who has just been asked
              // to confirm a real deletion will assume this one is too.
              body: 'The repository is removed from this list only. Nothing on disk is touched, and you can open it again at any time.',
              confirmLabel: 'Close repository',
              danger: true,
              blastRadius: null,
              onConfirm: () => close.mutate(repo.id),
            }),
        },
      ];
    },
    [
      checkout,
      close,
      dialogs,
      fetch,
      forgeItems,
      pull,
      push,
      repo.id,
      repo.name,
      repo.path,
      repo.worktrees,
      report,
      viewAllChanges,
    ],
  );

  return { refMenu, repoMenu, worktreeMenu, sectionMenu, checkout, report, viewAllChanges };
}

/** Past this the submenu is a list that wants scrolling, which menus don't do. */
const CHECKOUT_MENU_LIMIT = 12;

/**
 * Count what a destructive op would strand.
 *
 * Fails soft to `null` — "nothing becomes unreachable" — rather than leaving
 * the dialog stuck on "Checking what this affects…" forever. A confirm that
 * never resolves its own question is worse than one that admits it could not
 * answer, because the user cannot tell the two apart from the outside.
 */
async function countBlastRadius(
  repoId: string,
  query: { from: string; to?: string; movingRef?: string },
): Promise<{ count: number; sample: { sha: string; subject: string }[] } | null> {
  const api = bridge();
  if (!api) return null;
  try {
    return await api.ops.blastRadius({ repoId, ...query });
  } catch {
    return null;
  }
}

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
