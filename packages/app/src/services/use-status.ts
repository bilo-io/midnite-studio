import type {
  ChangeCounts,
  ConflictHunkSide,
  ConflictRegion,
  ConflictSide,
  GitOpResult,
  JournalOp,
  OpJournalEntry,
  RepoDescriptor,
  StatusResult,
  Worktree,
} from '@midnite/studio-shared';
import { computeUndoable } from '@midnite/studio-shared';
import { useMemo } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { useToasts } from '../components/toast-host';
import { useOpsJournalStore } from '../store/ops-journal-store';
import { useUiStore } from '../store/ui-store';
import { bridge } from './bridge';
import { shouldToastOp, useUndoJournalEntry, WIRED_UNDO_OPS } from './use-journal';
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

export type ChangeTotals = { fileCount: number; insertions: number; deletions: number };

/**
 * The whole-checkout roll-up: file count plus `+n −n`, for anything that needs
 * to answer "how big is this" without rendering every row — the all-changes
 * view's own header, and the tab that opens it.
 *
 * `undefined` while status is still loading, not a zeroed result — a tab
 * showing "0 files" for the instant before the real count arrives would read
 * as an empty checkout rather than a checkout not yet read.
 */
export function useAllChangesTotals({ repoId, worktreePath }: StatusTarget): ChangeTotals | undefined {
  const { data: status, isPlaceholderData } = useRepoStatus({ repoId, worktreePath });
  const counts = useStatusCounts({ repoId, worktreePath });

  return useMemo(() => {
    if (isPlaceholderData) return undefined;

    // One row per path — the same de-dupe the all-changes view applies before
    // rendering, so a staged-then-edited file is not counted twice here either.
    const seenPaths = new Set<string>();
    const entries = (status?.entries ?? []).filter((entry) => {
      if (seenPaths.has(entry.path)) return false;
      seenPaths.add(entry.path);
      return true;
    });

    return entries.reduce<ChangeTotals>(
      (sum, entry) => {
        const row =
          entry.unstaged === 'unmodified' ? counts.staged(entry.path) : counts.unstaged(entry.path);
        return {
          fileCount: sum.fileCount + 1,
          insertions: sum.insertions + row.insertions,
          deletions: sum.deletions + row.deletions,
        };
      },
      { fileCount: 0, insertions: 0, deletions: 0 },
    );
  }, [status, isPlaceholderData, counts]);
}

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
 * Every git write in the app, named for the status bar's op-progress segment.
 *
 * A string-literal union rather than an open string: adding an operation
 * without deciding what the bar calls it is a compile error, not a silent
 * "undefined in progress".
 */
export type GitOpId =
  | 'fetch'
  | 'pull'
  | 'push'
  | 'merge'
  | 'rebase'
  | 'cherry-pick'
  | 'revert'
  | 'checkout'
  | 'reset'
  | 'stage'
  | 'unstage'
  | 'discard'
  | 'commit'
  | 'branch-create'
  | 'branch-delete'
  | 'branch-rename'
  | 'tag-create'
  | 'worktree-add'
  | 'abort'
  | 'continue'
  | 'conflict-resolve-whole-file'
  | 'conflict-apply-hunk';

/** The present participle the op-progress segment renders while one runs. */
export const GIT_OP_LABEL: Record<GitOpId, string> = {
  fetch: 'Fetching…',
  pull: 'Pulling…',
  push: 'Pushing…',
  merge: 'Merging…',
  rebase: 'Rebasing…',
  'cherry-pick': 'Cherry-picking…',
  revert: 'Reverting…',
  checkout: 'Checking out…',
  reset: 'Resetting…',
  stage: 'Staging…',
  unstage: 'Unstaging…',
  discard: 'Discarding…',
  commit: 'Committing…',
  'branch-create': 'Creating branch…',
  'branch-delete': 'Deleting branch…',
  'branch-rename': 'Renaming branch…',
  'tag-create': 'Creating tag…',
  'worktree-add': 'Adding worktree…',
  abort: 'Aborting…',
  continue: 'Continuing…',
  'conflict-resolve-whole-file': 'Resolving…',
  'conflict-apply-hunk': 'Resolving…',
};

/**
 * Which verb wins when two ops are in flight at once.
 *
 * History rewrites outrank network, which outranks index work — a 30-second
 * rebase must not be visually stomped by a 200ms fetch that happened to start
 * later.
 */
export const GIT_OP_RANK: Record<GitOpId, number> = {
  rebase: 100,
  merge: 100,
  'cherry-pick': 100,
  revert: 100,
  reset: 100,
  push: 50,
  pull: 50,
  fetch: 50,
  stage: 10,
  unstage: 10,
  discard: 10,
  commit: 10,
  checkout: 30,
  'branch-create': 30,
  'branch-delete': 30,
  'branch-rename': 30,
  'tag-create': 30,
  'worktree-add': 30,
  abort: 40,
  continue: 40,
  'conflict-resolve-whole-file': 10,
  'conflict-apply-hunk': 10,
};

/**
 * The past-tense label a journal entry (and its toast) shows for a
 * generically-recorded op. Deliberately generic — no file counts, no branch
 * names — because `useTargetedGitOp` is generic over `TArgs` and cannot read
 * an op's own argument shape; a call site that wants a richer label passes
 * one through `JournalHint.label` instead (see `use-graph-actions.ts`'s
 * branch-delete for an example).
 */
const JOURNAL_OP_LABEL: Record<GitOpId, string> = {
  fetch: 'Fetched',
  pull: 'Pulled',
  push: 'Pushed',
  merge: 'Merged',
  rebase: 'Rebased',
  'cherry-pick': 'Cherry-picked',
  revert: 'Reverted',
  checkout: 'Checked out',
  reset: 'Reset',
  stage: 'Staged changes',
  unstage: 'Unstaged changes',
  discard: 'Discarded changes',
  commit: 'Committed',
  'branch-create': 'Created a branch',
  'branch-delete': 'Deleted a branch',
  'branch-rename': 'Renamed a branch',
  'tag-create': 'Created a tag',
  'worktree-add': 'Added a worktree',
  abort: 'Aborted',
  continue: 'Continued',
  'conflict-resolve-whole-file': 'Resolved a conflict',
  'conflict-apply-hunk': 'Resolved a conflict region',
};

/**
 * What a call site can tell the generic journal-recording wrapper about ITS
 * op that the wrapper cannot infer from `TArgs` alone.
 *
 * `refBefore`/`headBefore`/`headAfter` default to the current checkout's HEAD
 * (before) and freshly-read HEAD (after) — right for `commit`/`reset`/
 * `checkout`, wrong for an op whose ref is not HEAD (`branch-delete`, whose
 * own branch may not even be the one checked out). Those call sites override
 * the defaults; everyone else can omit this argument entirely.
 */
export type JournalHint<TArgs> = (args: TArgs) => {
  label?: string;
  refBefore?: string | null;
  headBefore?: string | null;
  headAfter?: string | null;
};

/**
 * Wrap a git operation so it invalidates the repo afterwards and never rejects.
 *
 * The result is data, not an exception — a conflict is an expected outcome the
 * UI renders — so callers read `result.ok` instead of catching.
 *
 * Every SUCCESSFUL write also records a Phase 22 Theme H journal entry and, for
 * the ops `shouldToastOp` names, raises a toast — with a live Undo button only
 * for the two in `WIRED_UNDO_OPS`. This is the one seam every op in the app
 * already runs through, which is why the recording lives here instead of at
 * each of the dozen call sites.
 */
export function useGitOp<TArgs>(
  opId: GitOpId,
  run: (api: NonNullable<ReturnType<typeof bridge>>, args: TArgs, ctx: { repoId: string; worktreePath?: string }) => Promise<GitOpResult>,
  journalHint?: JournalHint<TArgs>,
) {
  return useTargetedGitOp(useActiveWorktree(), opId, run, journalHint);
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
  opId: GitOpId,
  run: (api: NonNullable<ReturnType<typeof bridge>>, args: TArgs, ctx: { repoId: string; worktreePath?: string }) => Promise<GitOpResult>,
  journalHint?: JournalHint<TArgs>,
) {
  const client = useQueryClient();
  const record = useOpsJournalStore((s) => s.record);
  const toasts = useToasts();
  const undo = useUndoJournalEntry();

  return useMutation<GitOpResult, never, TArgs>({
    mutationKey: ['git-op', opId],
    mutationFn: async (args: TArgs) => {
      const api = bridge();
      if (!api || !repoId) {
        return { ok: false, kind: 'error', message: 'No repository selected.' };
      }
      const ctx = { repoId, ...(worktreePath ? { worktreePath } : {}) };
      const cachedHeadBefore =
        client.getQueryData<StatusResult>(keys.status(repoId, worktreePath))?.branch.oid ?? null;
      const hint = journalHint?.(args) ?? {};

      const result = await run(api, args, ctx);

      if (result.ok) {
        const op = opId as JournalOp;
        const headBefore = hint.headBefore !== undefined ? hint.headBefore : cachedHeadBefore;
        const headAfter =
          hint.headAfter !== undefined
            ? hint.headAfter
            : await api.status
                .get(ctx)
                .then((status) => status.branch.oid)
                .catch(() => null);
        const refBefore = hint.refBefore ?? 'HEAD';

        const entry: OpJournalEntry = {
          id: crypto.randomUUID(),
          repoId,
          ...(worktreePath ? { worktreePath } : {}),
          op,
          label: hint.label ?? JOURNAL_OP_LABEL[opId],
          at: Date.now(),
          headBefore,
          headAfter,
          refBefore,
          undoable: computeUndoable(op, { headBefore, headAfter, refBefore }),
        };
        record(entry);

        if (shouldToastOp(op)) {
          const wired = WIRED_UNDO_OPS.includes(op) && entry.undoable;
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

export const useStage = () =>
  useGitOp<string[]>('stage', (api, paths, ctx) => api.ops.stage({ ...ctx, paths }));

export const useUnstage = () =>
  useGitOp<string[]>('unstage', (api, paths, ctx) => api.ops.unstage({ ...ctx, paths }));

export const useDiscard = () =>
  useGitOp<string[]>('discard', (api, paths, ctx) => api.ops.discard({ ...ctx, paths }));

/** Accept one side for an entire conflicted path (Phase 47 Theme B). */
/**
 * Targeted, not `useGitOp`: the Studio (Phase 47 Theme D) opens for whichever
 * checkout `ConflictBanner` was rendered for, passed down as a prop — reading
 * the globally *active* worktree instead (what plain `useGitOp` does) would
 * silently resolve against the wrong checkout the one time those two differ.
 */
export const useConflictResolveWholeFile = (target: StatusTarget) =>
  useTargetedGitOp<{ path: string; side: ConflictSide }>(
    target,
    'conflict-resolve-whole-file',
    (api, args, ctx) => api.ops.conflictResolveWholeFile({ ...ctx, ...args }),
  );

/** Resolve one region within a conflicted path (Phase 47 Theme C/D). See above re: targeting. */
export const useConflictApplyHunk = (target: StatusTarget) =>
  useTargetedGitOp<{ path: string; regionIndex: number; region: ConflictRegion; side: ConflictHunkSide }>(
    target,
    'conflict-apply-hunk',
    (api, args, ctx) => api.ops.conflictApplyHunk({ ...ctx, ...args }),
  );

export const useCommit = () =>
  useGitOp<{ message: string; amend?: boolean }>('commit', (api, args, ctx) =>
    api.ops.commit({ ...ctx, message: args.message, amend: args.amend ?? false }),
  );

/**
 * Sync scope.
 *
 * Every field is optional, and omitting all of them is the title-bar cluster's
 * "sync whatever I am on" — the behaviour these three had before Phase 12. The
 * ref badges pass a scope instead, because a branch chip three rows down the
 * graph is not HEAD and pushing HEAD when the user clicked ↑ on `feature/x` is
 * the kind of wrong that only shows up after it has happened.
 *
 * `PushRequest`/`PullRequest` have carried `{remote, branch}` since Phase 6, so
 * this is the renderer catching up with the contract rather than a new one.
 */
export type SyncScope = { remote?: string; branch?: string };

export const useFetch = () =>
  useGitOp<SyncScope>('fetch', (api, args, ctx) =>
    api.ops.fetch({ ...ctx, ...(args.remote ? { remote: args.remote } : {}) }),
  );

export const usePull = () =>
  useGitOp<SyncScope>('pull', (api, args, ctx) =>
    api.ops.pull({
      ...ctx,
      ...(args.remote ? { remote: args.remote } : {}),
      ...(args.branch ? { branch: args.branch } : {}),
    }),
  );

export const usePush = () =>
  useGitOp<SyncScope & { setUpstream: boolean; forceWithLease?: { ref: string; expect: string } }>(
    'push',
    (api, args, ctx) =>
      api.ops.push({
        ...ctx,
        setUpstream: args.setUpstream,
        ...(args.remote ? { remote: args.remote } : {}),
        ...(args.branch ? { branch: args.branch } : {}),
        ...(args.forceWithLease ? { forceWithLease: args.forceWithLease } : {}),
      }),
  );
