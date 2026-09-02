import { useCallback, useMemo, useState } from 'react';

import type { GitOpResult, GraphRow, Ref, Remote } from '@midnite/studio-shared';
import {
  LuTriangleAlert,
  LuArrowDownToLine,
  LuArrowRightLeft,
  LuArrowUpFromLine,
  LuCircle,
  LuCircleDot,
  LuExternalLink,
  LuGitBranchPlus,
  LuGitCommitHorizontal,
  LuGitCompare,
  LuGitMerge,
  LuPencil,
  LuRefreshCw,
  LuRotateCcw,
  LuTag,
  LuTrash2,
  LuCloudUpload,
} from 'react-icons/lu';

import { useDialogs } from '../../components/dialog-host';
import { validateRefName } from '../../components/prompt-dialog';
import type { MenuItem } from '../../components/context-menu';
import { bridge } from '../../services/bridge';
import { useActiveWorktree, useFetch, useGitOp, usePull, usePush } from '../../services/use-status';
import { useRemotes } from '../../services/queries';
import { useWorkbenchStore } from '../../store/workbench-store';
import { syncActions, type SyncAction } from './ref-sync';

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

  const checkout = useGitOp<{ target: string; detach?: boolean }>('checkout', (api, args, ctx) =>
    api.ops.checkout({ ...ctx, target: args.target, detach: args.detach ?? false }),
  );
  const branchCreate = useGitOp<{ name: string; startPoint: string; checkout: boolean }>(
    'branch-create',
    (api, args, ctx) => api.ops.branchCreate({ ...ctx, ...args }),
  );
  const branchDelete = useGitOp<{ name: string; force: boolean; sha: string }>(
    'branch-delete',
    (api, args, ctx) => api.ops.branchDelete({ ...ctx, name: args.name, force: args.force }),
    /*
     * `refBefore`/`headBefore` here are the ref that ACTUALLY moved — the
     * deleted branch — not the checkout's `HEAD`, which never moves when you
     * delete a branch you are not on (deleting the current branch is refused
     * before this ever runs). Phase 22 Theme H's branch-delete undo
     * (`services/use-journal.ts`) reads exactly these two fields to recreate
     * the branch at its prior sha.
     */
    (args) => ({
      label: `Deleted branch ${args.name}`,
      refBefore: `refs/heads/${args.name}`,
      headBefore: args.sha,
      headAfter: null,
    }),
  );
  const branchRename = useGitOp<{ from: string; to: string }>('branch-rename', (api, args, ctx) =>
    api.ops.branchRename({ ...ctx, ...args }),
  );
  const tagCreate = useGitOp<{ name: string; target: string }>('tag-create', (api, args, ctx) =>
    api.ops.tagCreate({ ...ctx, ...args }),
  );
  const resetTo = useGitOp<{ target: string; mode: 'soft' | 'mixed' | 'hard' }>(
    'reset',
    (api, args, ctx) => api.ops.reset({ ...ctx, ...args }),
  );
  const mergeBranch = useGitOp<{ source: string }>('merge', (api, args, ctx) =>
    api.ops.merge({ ...ctx, source: args.source, noFastForward: false }),
  );
  const rebaseOnto = useGitOp<{ onto: string }>('rebase', (api, args, ctx) =>
    api.ops.rebase({ ...ctx, onto: args.onto }),
  );
  const cherryPickCommits = useGitOp<{ shas: string[] }>('cherry-pick', (api, args, ctx) =>
    api.ops.cherryPick({ ...ctx, shas: args.shas }),
  );

  const report = useCallback(
    (result: GitOpResult) => {
      if (result.ok) onError('');
      else if (result.kind === 'error') onError(result.message);
      // A conflict is not an error message — the conflict banner takes over and
      // says everything that needs saying, with the way out attached.
      else onError('');
    },
    [onError],
  );

  const fetchRemote = useFetch();
  const pullBranch = usePull();
  const pushBranch = usePush();
  const { data: remotes = EMPTY_REMOTES } = useRemotes(repoId);
  const remoteNames = useMemo(() => remotes.map((remote) => remote.name), [remotes]);

  /**
   * Which verb is in flight on which ref.
   *
   * A map rather than a single slot, and neither is the obvious `isPending` on
   * the mutation: the three mutations are shared by every badge in the graph,
   * so `isPending` would spin all of them at once. A single slot fixed that and
   * introduced a subtler version of it — two branches syncing at the same time,
   * and whichever settled FIRST cleared the other's spinner and collapsed the
   * strip out from under it.
   */
  const [syncing, setSyncing] = useState<Record<string, SyncAction['kind']>>({});

  /**
   * Run one derived sync verb.
   *
   * The verbs come from `syncActions`, so the badge buttons and the menu items
   * cannot disagree about what a branch may do — they are rendered from the
   * same array and executed through here.
   */
  const runSync = useCallback(
    (ref: Ref, action: SyncAction) => {
      if (action.disabled) return;
      setSyncing((current) => ({ ...current, [ref.fullName]: action.kind }));

      const scope = {
        remote: action.remote,
        ...(action.branch ? { branch: action.branch } : {}),
      };
      const run =
        action.kind === 'fetch'
          ? fetchRemote.mutateAsync({ remote: action.remote })
          : action.kind === 'pull'
            ? pullBranch.mutateAsync(scope)
            : pushBranch.mutateAsync({ ...scope, setUpstream: action.setUpstream });

      void run
        .then(report)
        // `finally`, not the success path: a failed push must release the
        // spinner too, or the badge stays busy until the next repo switch.
        .finally(() =>
          setSyncing((current) => {
            const { [ref.fullName]: _done, ...rest } = current;
            return rest;
          }),
        );
    },
    [fetchRemote, pullBranch, pushBranch, report],
  );

  const syncFor = useCallback(
    (ref: Ref, currentBranch: string | null) => syncActions(ref, currentBranch, remoteNames),
    [remoteNames],
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
          label: 'Open commit in tab',
          icon: LuExternalLink,
          onSelect: () => {
            if (repoId) {
              useWorkbenchStore.getState().openTab({
                kind: 'commit',
                repoId,
                sha,
                label: `${short}: ${row.commit.subject}`,
                ...(worktreePath ? { worktreePath } : {}),
              });
            }
          },
        },
        {
          label: 'Create branch here…',

          icon: LuGitBranchPlus,
          onSelect: () =>
            dialogs.prompt({
              title: `New branch at ${short}`,
              label: 'Branch name',
              confirmLabel: 'Create',
              placeholder: 'feature/my-change',
              validate: validateRefName,
              onConfirm: (name) =>
                void branchCreate
                  .mutateAsync({ name, startPoint: sha, checkout: true })
                  .then(report),
            }),
        },
        {
          label: 'Create tag here…',
          icon: LuTag,
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
          icon: LuArrowRightLeft,
          onSelect: () => void checkout.mutateAsync({ target: sha, detach: true }).then(report),
        },
        { type: 'separator' },
        {
          label: `Reset ${currentBranch ?? 'HEAD'} to here`,
          icon: LuRotateCcw,
          disabled: currentBranch === null,
          disabledReason: 'HEAD is detached — there is no branch to move.',
          submenu: [
            {
              label: 'Soft — keep changes staged',
              icon: LuCircle,
              onSelect: () => void resetTo.mutateAsync({ target: sha, mode: 'soft' }).then(report),
            },
            {
              label: 'Mixed — keep changes unstaged',
              icon: LuCircleDot,
              onSelect: () => void resetTo.mutateAsync({ target: sha, mode: 'mixed' }).then(report),
            },
            {
              label: 'Hard — discard changes',
              icon: LuTriangleAlert,
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
    [
      branchCreate,
      checkout,
      dialogs,
      repoId,
      report,
      resetTo,
      tagCreate,
      withBlastRadius,
      worktreePath,
    ],
  );

  /** Right-click on a ref badge. */
  const refMenu = useCallback(
    (ref: Ref, currentBranch: string | null): MenuItem[] => {
      const isCurrent = ref.kind === 'localBranch' && ref.name === currentBranch;
      const elsewhere = ref.worktreePath !== null && !isCurrent;

      const items: MenuItem[] = [
        {
          label: `Checkout ${ref.name}`,
          icon: LuArrowRightLeft,
          disabled: isCurrent || elsewhere,
          disabledReason: isCurrent
            ? 'Already checked out here.'
            : 'Checked out in another worktree — a branch can only be checked out once.',
          onSelect: () => void checkout.mutateAsync({ target: ref.name }).then(report),
        },
      ];

      /*
        The sync verbs, from the same `syncActions` array the badge's hover
        buttons render. The menu shows all of them — including the ones with no
        count — because this is where a branch with NO upstream can be
        published, and a branch with nothing to push still has a remote worth
        fetching. The badge only expands for the counted ones.
      */
      const sync = syncFor(ref, currentBranch);
      if (sync.length > 0) {
        items.push({ type: 'separator' });
        const syncIcon = {
          fetch: LuRefreshCw,
          pull: LuArrowDownToLine,
          push: LuArrowUpFromLine,
          publish: LuCloudUpload,
        };
        for (const action of sync) {
          items.push({
            label: action.label,
            icon: syncIcon[action.kind],
            disabled: action.disabled,
            ...(action.disabledReason ? { disabledReason: action.disabledReason } : {}),
            onSelect: () => runSync(ref, action),
          });
        }
      }

      if (ref.kind === 'localBranch') {
        items.push(
          { type: 'separator' },
          {
            label: 'Rename…',
            icon: LuPencil,
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
            icon: LuTrash2,
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
                    .mutateAsync({ name: ref.name, force: true, sha: ref.sha })
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
    [branchDelete, branchRename, checkout, dialogs, report, runSync, syncFor, withBlastRadius],
  );

  /**
   * The menu offered when something is dropped onto a branch badge.
   *
   * A drop never acts directly. "Merge X into Y" and "Rebase X onto Y" are the
   * same gesture with opposite effects on history, and guessing which one was
   * meant is not a guess worth making — GitKraken asks too. Cherry-pick is a
   * single action but still confirmed, because dropping a commit is easy to do
   * by accident while scrolling.
   */
  const dropMenu = useCallback(
    (source: DropSource, target: Ref, currentBranch: string | null): MenuItem[] => {
      if (source.kind === 'commit') {
        return [
          {
            label: `Cherry-pick ${source.sha.slice(0, 7)} onto ${target.name}`,
            icon: LuGitCommitHorizontal,
            disabled: target.name !== currentBranch,
            disabledReason: `Check out ${target.name} first — a cherry-pick applies to the current branch.`,
            onSelect: () => void cherryPickCommits.mutateAsync({ shas: [source.sha] }).then(report),
          },
        ];
      }

      const sourceName = source.ref.name;
      const targetIsCurrent = target.name === currentBranch;

      return [
        {
          label: `Merge ${sourceName} into ${target.name}`,
          icon: LuGitMerge,
          disabled: !targetIsCurrent,
          disabledReason: `Check out ${target.name} first — a merge brings changes into the current branch.`,
          onSelect: () => void mergeBranch.mutateAsync({ source: sourceName }).then(report),
        },
        {
          label: `Rebase ${target.name} onto ${sourceName}`,
          icon: LuGitCompare,
          disabled: !targetIsCurrent,
          disabledReason: `Check out ${target.name} first — a rebase replays the current branch.`,
          onSelect: () => void rebaseOnto.mutateAsync({ onto: sourceName }).then(report),
        },
      ];
    },
    [cherryPickCommits, mergeBranch, rebaseOnto, report],
  );

  return {
    commitMenu,
    refMenu,
    dropMenu,
    checkoutRef: checkout,
    report,
    syncFor,
    runSync,
    syncing,
  };
}

const EMPTY_REMOTES: Remote[] = [];

/** What can be dropped onto a branch badge. */
export type DropSource = { kind: 'ref'; ref: Ref } | { kind: 'commit'; sha: string };
