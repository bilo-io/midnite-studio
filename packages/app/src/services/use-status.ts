import type { GitOpResult, StatusResult } from '@midnite/git-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUiStore } from '../store/ui-store';
import { bridge } from './bridge';
import { keys } from './queries';

/**
 * Status and the operations that change it.
 *
 * Every mutation invalidates the whole repo subtree rather than a single key:
 * a commit changes status AND refs AND the ahead/behind counts, a pull changes
 * all of those plus history. Guessing at a narrower set is how a panel ends up
 * showing a branch that moved two operations ago.
 */
export const EMPTY_STATUS: StatusResult = {
  branch: {
    head: null,
    oid: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    unborn: false,
    detached: false,
  },
  entries: [],
  inProgress: null,
};

/** The checkout every status operation targets. */
export function useActiveWorktree(): { repoId: string | null; worktreePath?: string } {
  const repoId = useUiStore((s) => s.selectedRepoId);
  const worktreePath = useUiStore((s) => s.selectedWorktreePath);
  return { repoId, ...(worktreePath ? { worktreePath } : {}) };
}

/** A repo + one of its checkouts. `null` repoId means "nothing selected". */
export type StatusTarget = { repoId: string | null; worktreePath?: string };

/**
 * Status for an arbitrary checkout, not just the selected one.
 *
 * The sidebar needs this: each repository header carries its own sync control,
 * and "am I ahead of origin" is a question about THAT repo's primary checkout
 * regardless of which repo is currently selected. The key is the same one
 * `useStatus` uses, so a sidebar row and the title bar looking at the same
 * checkout share a single query rather than running `git status` twice.
 */
export function useRepoStatus({ repoId, worktreePath }: StatusTarget) {
  return useQuery<StatusResult>({
    queryKey: keys.status(repoId ?? '', worktreePath),
    queryFn: async () => {
      if (!repoId) return EMPTY_STATUS;
      const api = bridge();
      if (!api) return EMPTY_STATUS;
      return api.status.get({ repoId, ...(worktreePath ? { worktreePath } : {}) });
    },
    enabled: repoId !== null,
    placeholderData: EMPTY_STATUS,
  });
}

export function useStatus() {
  return useRepoStatus(useActiveWorktree());
}

/**
 * Wrap a git operation so it invalidates the repo afterwards and never rejects.
 *
 * The result is data, not an exception — a conflict is an expected outcome the
 * UI renders — so callers read `result.ok` instead of catching.
 */
export function useGitOp<TArgs>(
  run: (api: NonNullable<ReturnType<typeof bridge>>, args: TArgs, ctx: { repoId: string; worktreePath?: string }) => Promise<GitOpResult>,
) {
  return useTargetedGitOp(useActiveWorktree(), run);
}

/**
 * `useGitOp` against an explicit checkout.
 *
 * Same envelope and the same post-op invalidation; the difference is only where
 * the operation lands. The sidebar acts on a repository the user has not
 * selected — its header's Push must push THAT repo — and omitting
 * `worktreePath` targets the primary checkout, which is what
 * `resolveWorkdir` in main falls back to.
 */
export function useTargetedGitOp<TArgs>(
  { repoId, worktreePath }: StatusTarget,
  run: (api: NonNullable<ReturnType<typeof bridge>>, args: TArgs, ctx: { repoId: string; worktreePath?: string }) => Promise<GitOpResult>,
) {
  const client = useQueryClient();

  return useMutation<GitOpResult, never, TArgs>({
    mutationFn: async (args: TArgs) => {
      const api = bridge();
      if (!api || !repoId) {
        return { ok: false, kind: 'error', message: 'No repository selected.' };
      }
      return run(api, args, { repoId, ...(worktreePath ? { worktreePath } : {}) });
    },
    onSettled: async () => {
      if (repoId) await client.invalidateQueries({ queryKey: keys.repo(repoId) });
    },
  });
}

export const useStage = () =>
  useGitOp<string[]>((api, paths, ctx) => api.ops.stage({ ...ctx, paths }));

export const useUnstage = () =>
  useGitOp<string[]>((api, paths, ctx) => api.ops.unstage({ ...ctx, paths }));

export const useDiscard = () =>
  useGitOp<string[]>((api, paths, ctx) => api.ops.discard({ ...ctx, paths }));

export const useCommit = () =>
  useGitOp<{ message: string; amend?: boolean }>((api, args, ctx) =>
    api.ops.commit({ ...ctx, message: args.message, amend: args.amend ?? false }),
  );

export const useFetch = () => useGitOp<void>((api, _args, ctx) => api.ops.fetch({ ...ctx }));
export const usePull = () => useGitOp<void>((api, _args, ctx) => api.ops.pull({ ...ctx }));
export const usePush = () =>
  useGitOp<{ setUpstream: boolean }>((api, args, ctx) =>
    api.ops.push({ ...ctx, setUpstream: args.setUpstream }),
  );
