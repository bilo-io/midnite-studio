import type {
  ChangeCounts,
  GitOpResult,
  RepoDescriptor,
  StatusResult,
  Worktree,
} from '@midnite/git-shared';
import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

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
 * `+n −n` per path, for the panels that show numbers.
 *
 * Separate from `useRepoStatus` on purpose. Status is fetched for every
 * checkout of every open repository to draw the sidebar's change counts; the
 * line counts cost two more subprocesses and a walk of the untracked files, and
 * only two views render them. Keeping the two queries apart is what stops a
 * sidebar of eight worktrees from paying for numbers nobody is looking at.
 *
 * Returns lookups rather than arrays: every caller is asking "what are the
 * counts for THIS row", and a missing path means zero, not missing.
 */
export type StatusCountLookup = {
  staged: (path: string) => ChangeCounts;
  unstaged: (path: string) => ChangeCounts;
};

export function useStatusCounts({ repoId, worktreePath }: StatusTarget): StatusCountLookup {
  const { data } = useQuery({
    queryKey: keys.statusCounts(repoId ?? '', worktreePath),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_COUNTS;
      return api.status.counts({ repoId, ...(worktreePath ? { worktreePath } : {}) });
    },
    enabled: repoId !== null,
    placeholderData: EMPTY_COUNTS,
  });

  return useMemo(() => {
    const index = (rows: readonly ChangeCounts[]) => {
      const byPath = new Map(rows.map((row) => [row.path, row]));
      return (path: string): ChangeCounts =>
        byPath.get(path) ?? { path, insertions: 0, deletions: 0 };
    };
    return { staged: index(data?.staged ?? []), unstaged: index(data?.unstaged ?? []) };
  }, [data]);
}

const EMPTY_COUNTS = { staged: [], unstaged: [] };

/**
 * Status for EVERY checkout of a repository, keyed by worktree path.
 *
 * The sidebar used to fetch only the primary checkout, so a linked worktree
 * with a dozen uncommitted files rendered exactly like a clean one. Nothing in
 * main had to change for this: `status.get` has always taken an optional
 * `worktreePath`, `resolveWorkdir` validates it against `git worktree list`,
 * and `getStatus` resolves `.git` through `rev-parse --git-dir` so it works
 * inside a linked worktree.
 *
 * `useQueries` with EXACTLY `keys.status(repoId, path)` is the load-bearing
 * part. Sharing the key means a row's count and the Changes panel that later
 * selects that same worktree are one cached `git status`, not two — and the
 * watcher's existing invalidation reaches both without knowing this hook
 * exists.
 *
 * `enabled` is the caller's promise that these are worth a subprocess apiece.
 */
export type WorktreeStatuses = {
  /** Only checkouts whose real status has ARRIVED. Absent is not clean. */
  byPath: ReadonlyMap<string, StatusResult>;
  /** Changed paths across every checkout, for the collapsed repo row. */
  total: number;
  /** True until every checkout has answered — nothing may be hidden before then. */
  isLoading: boolean;
};

export function useWorktreeStatuses(
  repo: Pick<RepoDescriptor, 'id' | 'worktrees'>,
  enabled: boolean,
): WorktreeStatuses {
  const results = useQueries({
    queries: repo.worktrees.map((worktree: Worktree) => ({
      queryKey: keys.status(repo.id, worktree.path),
      queryFn: async (): Promise<StatusResult> => {
        const api = bridge();
        if (!api) return EMPTY_STATUS;
        return api.status.get({ repoId: repo.id, worktreePath: worktree.path });
      },
      enabled,
      placeholderData: EMPTY_STATUS,
    })),
  });

  const paths = repo.worktrees.map((worktree) => worktree.path);
  /*
    `isPlaceholderData` is what keeps this honest, the same way it does in the
    repo header. The placeholder is an EMPTY status, so treating it as data
    would report every checkout as clean for as long as the query is in
    flight — and Theme B's filter would then hide a dirty worktree on the
    strength of a number that had not arrived yet.
  */
  const settled = results.map((result) => (result.isPlaceholderData ? undefined : result.data));
  const key = settled
    .map((status, index) => `${paths[index]}:${status?.entries.length ?? -1}`)
    .join('|');

  return useMemo(() => {
    const byPath = new Map<string, StatusResult>();
    let total = 0;
    let isLoading = false;

    settled.forEach((status, index) => {
      const path = paths[index];
      if (path === undefined) return;
      if (!status) {
        isLoading = true;
        return;
      }
      byPath.set(path, status);
      total += status.entries.length;
    });

    return { byPath, total, isLoading };
    // `key` collapses the results to the only thing downstream reads — which
    // path has how many changes — so the map identity survives the refetches
    // that return an unchanged status.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
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
