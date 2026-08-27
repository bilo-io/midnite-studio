import type {
  DiagnosticsCandidate,
  DiagnosticsCommand,
  DiagnosticsRun,
  DiagnosticsTrustStatus,
  ForgeIssuesResult,
  ForgePullCommentsResult,
  ForgePullDetailResult,
  ForgePullFilesResult,
  ForgePullsResult,
  ForgePullThreadsResult,
  ForgeRunDetailResult,
  ForgeRunLogResult,
  ForgeRunsResult,
  ForgeWorkflowsResult,
  ForgeWriteResult,
  Ref,
  Remote,
  RepoDescriptor,
  RepoStats,
  StatsWindow,
  TestDiscovery,
  TestTrustStatus,
  Worktree,
} from '@midnite/git-shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { bridge } from './bridge';

/**
 * TanStack Query keys, in one place.
 *
 * Every key is a prefix-able tuple so the watcher (Phase 10) can invalidate a
 * whole repo's data with one call rather than enumerating query names —
 * `invalidateQueries({ queryKey: keys.repo(id) })` catches refs, worktrees and
 * status together.
 */
export const keys = {
  repos: ['repos'] as const,
  repo: (repoId: string) => ['repos', repoId] as const,
  refs: (repoId: string) => ['repos', repoId, 'refs'] as const,
  worktrees: (repoId: string) => ['repos', repoId, 'worktrees'] as const,
  /**
   * A repo's configured remotes.
   *
   * Under the `repos/<id>` prefix like everything else, so closing a repo drops
   * it and a `head` watch event refreshes it. It is deliberately NOT refreshed
   * on `refs` events: a fetch fires those constantly and cannot change what is
   * configured in `.git/config`. The gap that leaves is a `git remote add` run
   * in the integrated terminal, which the watcher does not classify at all —
   * reopening the repo picks it up, and inventing a `config` watch kind for one
   * rare command is not worth the extra fs traffic.
   */
  remotes: (repoId: string) => ['repos', repoId, 'remotes'] as const,
  status: (repoId: string, worktreePath?: string) =>
    ['repos', repoId, 'status', worktreePath ?? 'main'] as const,
  /**
   * A checkout's per-path `+n −n`. Under `status` for the same reason `diff` is:
   * every index or worktree event invalidates that prefix, and counts that
   * outlived the edit they describe would be worse than no counts at all.
   */
  statusCounts: (repoId: string, worktreePath?: string) =>
    [...keys.status(repoId, worktreePath), 'counts'] as const,
  /**
   * A worktree/index diff. Deliberately nested UNDER `status`: the watcher
   * invalidates `keys.status(repoId)` non-exactly on every worktree and index
   * event, and the global client sets `staleTime: Infinity`. A diff key outside
   * that prefix is never invalidated and never refetched — the pane would keep
   * rendering hunks from before the file was edited, staged or discarded, for
   * the life of the process.
   */
  diff: (
    repoId: string,
    worktreePath: string | undefined,
    path: string,
    staged: boolean,
    context: number,
  ) => [...keys.status(repoId, worktreePath), 'diff', path, staged, context] as const,
  /**
   * A repo's GitHub listings.
   *
   * Under the repo prefix so closing one drops them, but deliberately NOT
   * under `status`: the watcher fires `status` invalidations on every index
   * and worktree event, and a local edit tells us nothing new about what CI
   * concluded ten minutes ago. These refresh on their own clock and on the
   * section's own refresh button.
   */
  forge: (repoId: string) => ['repos', repoId, 'forge'] as const,
  forgeRuns: (repoId: string, branch?: string) =>
    ['repos', repoId, 'forge', 'runs', branch ?? 'all'] as const,
  forgePulls: (repoId: string, limit = 20, state = 'open') =>
    ['repos', repoId, 'forge', 'pulls', limit, state] as const,
  forgeIssues: (repoId: string, state: string) =>
    ['repos', repoId, 'forge', 'issues', state] as const,
  /**
   * One run's job tree.
   *
   * Keyed by run id under the forge prefix, so the section's Refresh drops
   * every open run's tree along with the listing above it — a re-fetched run
   * list beside a stale job tree is the one combination that would lie.
   */
  forgeRunDetail: (repoId: string, runId: string) =>
    ['repos', repoId, 'forge', 'run-detail', runId] as const,
  /**
   * One run's log.
   *
   * `full` is part of the key, not a parameter of the same query: the capped
   * and un-capped answers are different payloads, and sharing a key would make
   * "show the whole log" replace the cached window it was expanded from.
   */
  forgeRunLog: (repoId: string, runId: string, full: boolean) =>
    ['repos', repoId, 'forge', 'run-log', runId, full] as const,
  forgeWorkflows: (repoId: string) => ['repos', repoId, 'forge', 'workflows'] as const,
  /**
   * One opened pull request's three payloads.
   *
   * Keyed by PR number under the forge prefix, so the section's Refresh drops
   * an open PR's detail along with the listing it was opened from — the same
   * rule `forgeRunDetail` follows, and for the same reason: a re-fetched list
   * beside a stale diff is the combination that would lie.
   *
   * Three keys rather than one, because they are three fetches: a reader who
   * only ever opens the Files tab should never pay for the conversation.
   */
  forgePullDetail: (repoId: string, number: number) =>
    ['repos', repoId, 'forge', 'pull-detail', number] as const,
  forgePullFiles: (repoId: string, number: number) =>
    ['repos', repoId, 'forge', 'pull-files', number] as const,
  forgePullComments: (repoId: string, number: number) =>
    ['repos', repoId, 'forge', 'pull-comments', number] as const,
  /**
   * One PR's inline threads.
   *
   * A fourth key beside the other three, not a widening of `pull-comments`: the
   * Files tab reads this and the Conversation tab reads that, and sharing a key
   * would make either tab's fetch serve the other's payload. It is the key a
   * successful comment, reply or resolve invalidates.
   */
  forgePullThreads: (repoId: string, number: number) =>
    ['repos', repoId, 'forge', 'pull-threads', number] as const,
  /** Whether `gh` is installed and signed in. Not repo-scoped — it is machine state. */
  forgeCli: ['forge', 'cli'] as const,
  /**
   * A repo's dashboard statistics, per window and churn setting.
   *
   * Under the repo prefix so closing one drops it, and deliberately NOT under
   * `status`: the watcher fires `status` on every index and worktree event —
   * every keystroke-save — and none of those change a commit history. `refs`
   * and `head` do, and those invalidate this key explicitly.
   */
  stats: (repoId: string) => ['repos', repoId, 'stats'] as const,
  statsSummary: (repoId: string, window: string, withChurn: boolean) =>
    ['repos', repoId, 'stats', window, withChurn] as const,
  /**
   * A commit's diff. Under the repo (so it is dropped when the repo closes) but
   * NOT under `status` — a commit is immutable, so a working-tree event has
   * nothing to say about it.
   */
  commitDiff: (repoId: string, sha: string, path: string, context: number) =>
    ['repos', repoId, 'commit-diff', sha, path, context] as const,
  /**
   * One commit's metadata and file list. Under the repo, and — like
   * `commitDiff` — deliberately NOT under `status`: a commit is immutable, so no
   * worktree event has anything to say about it.
   */
  commitDetail: (repoId: string, sha: string) => ['repos', repoId, 'commit', sha] as const,
  /**
   * Repo diagnostics. Under the repo so closing one drops them, and — like
   * `forge` — deliberately NOT under `status`: the watcher fires on every
   * keystroke-save, and re-linting on a file change is exactly what the trust
   * policy forbids. These refresh only when a human asks.
   */
  diag: (repoId: string) => ['repos', repoId, 'diag'] as const,
  diagTrust: (repoId: string) => ['repos', repoId, 'diag', 'trust'] as const,
  diagDetect: (repoId: string) => ['repos', repoId, 'diag', 'detect'] as const,
  diagRun: (repoId: string) => ['repos', repoId, 'diag', 'run'] as const,
  testsDiscover: (repoId: string) => ['repos', repoId, 'tests', 'discover'] as const,
  testsTrust: (repoId: string, suiteId: string) =>
    ['repos', repoId, 'tests', 'trust', suiteId] as const,
};

/**
 * Data the renderer cannot produce and must not guess at.
 *
 * `enabled` guards on the bridge rather than the query throwing: under
 * vitest/jsdom there is no preload, and a component should render its empty
 * state rather than an error.
 */
export function useRepos() {
  return useQuery<RepoDescriptor[]>({
    queryKey: keys.repos,
    queryFn: async () => (await bridge()?.repos.list()) ?? [],
  });
}

/**
 * Apply a new id order to a list, dropping any id the list no longer has an
 * entry for.
 *
 * A pure function so `useReorderRepos`'s optimistic write and its unit test
 * share the one implementation.
 */
export function reorderByIds<T extends { id: string }>(items: readonly T[], ids: string[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
}

/**
 * Reorder the repo list, optimistically.
 *
 * `repos.reorder` is one-way (`ipcRenderer.send`, no response) — ordering is a
 * preference, and the next drag rewrites the whole list anyway, so there is
 * nothing worth a round trip. But that means nothing ever tells the `repos`
 * query to refetch: without writing the new order into the cache here, the
 * row a drag just moved snaps straight back the instant the drop settles,
 * because `ids` in `ReposPanel` is read from a query result the IPC call
 * never changes.
 */
export function useReorderRepos(): (repoIds: string[]) => void {
  const client = useQueryClient();
  return (repoIds: string[]) => {
    client.setQueryData<RepoDescriptor[]>(keys.repos, (current) =>
      current ? reorderByIds(current, repoIds) : current,
    );
    bridge()?.repos.reorder({ repoIds });
  };
}

export function useRefs(repoId: string | null) {
  return useQuery<Ref[]>({
    queryKey: keys.refs(repoId ?? ''),
    queryFn: async () => (repoId ? ((await bridge()?.repos.refs({ repoId })) ?? []) : []),
    enabled: repoId !== null,
  });
}

export function useWorktrees(repoId: string | null) {
  return useQuery<Worktree[]>({
    queryKey: keys.worktrees(repoId ?? ''),
    queryFn: async () => (repoId ? ((await bridge()?.repos.worktrees({ repoId })) ?? []) : []),
    enabled: repoId !== null,
  });
}

/**
 * The repo's remotes, with each URL already normalised into a `forge` in main.
 *
 * Shipped pre-derived rather than parsed here: the renderer may not import
 * git-engine, so deriving it on this side would mean a second implementation of
 * git's five remote-URL syntaxes.
 */
export function useRemotes(repoId: string | null) {
  return useQuery<Remote[]>({
    queryKey: keys.remotes(repoId ?? ''),
    queryFn: async () => (repoId ? ((await bridge()?.remotes.list({ repoId })) ?? []) : []),
    enabled: repoId !== null,
  });
}

/**
 * Open a URL in the user's browser, via the protocol-guarded main handler.
 *
 * Not `window.open`: the packaged app is a `file://` origin, and while
 * `setWindowOpenHandler` in main already intercepts anchor clicks, a
 * programmatic hand-off should go through the channel that states — and
 * enforces — which protocols are allowed. A refused URL resolves `{ok:false}`
 * rather than rejecting, so a bad link is a no-op, not an unhandled rejection.
 */
export function openExternal(url: string): void {
  void bridge()?.shell.openExternal({ url });
}

/**
 * One commit in full — metadata, parents and the per-file counts.
 *
 * `data === null` is a real answer, not a loading state: the sha may name no
 * commit in this repository, which is what a linkified reference out of a commit
 * message can legitimately do. The pane distinguishes the two on `isLoading`.
 */
export function useCommitDetail(repoId: string | null, sha: string | null) {
  // No explicit generic: the bridge's own return type is the authority on the
  // shape, and restating it here is a second declaration that can drift from it.
  return useQuery({
    queryKey: keys.commitDetail(repoId ?? '', sha ?? ''),
    queryFn: async () =>
      repoId && sha ? ((await bridge()?.status.commitDetail({ repoId, sha })) ?? null) : null,
    enabled: repoId !== null && sha !== null,
    // A commit is immutable, so this never goes stale.
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/**
 * Resolve an abbreviated revision to its full sha.
 *
 * Imperative rather than a query: the caller is a click handler on a linkified
 * sha, and the answer is needed once, to decide what to select — not held as
 * state anybody renders.
 */
export async function resolveRevision(repoId: string, rev: string): Promise<string | null> {
  const res = await bridge()?.repos.revParse({ repoId, rev });
  return res?.sha ?? null;
}

/**
 * Put text on the system clipboard, reporting whether it landed.
 *
 * Through main rather than `navigator.clipboard`: the packaged app loads from
 * `file://`, which is not guaranteed to be a secure context, and the Async
 * Clipboard API is gated on one. Returns false with no bridge at all, so a
 * copy button under vitest/jsdom reports failure instead of throwing.
 */
export async function copyText(text: string): Promise<boolean> {
  const res = await bridge()?.clipboard.writeText({ text });
  return res?.ok ?? false;
}

/** Everything derived from a repo, after an op that could have changed any of it. */
export const invalidateRepo = (client: QueryClient, repoId: string): Promise<void> =>
  client.invalidateQueries({ queryKey: keys.repo(repoId) }).then(() => undefined);

export function useOpenRepo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const api = bridge();
      if (!api) return { ok: false as const, message: 'Desktop bridge unavailable.' };
      return api.repos.open({ path });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.repos }),
  });
}

export function usePickAndOpenRepo() {
  const open = useOpenRepo();
  return {
    ...open,
    /** Resolves to null when the user cancels the native dialog. */
    pickAndOpen: async () => {
      const path = await bridge()?.repos.pickDirectory();
      if (!path) return null;
      return open.mutateAsync(path);
    },
  };
}

export function useCloseRepo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (repoId: string) => bridge()?.repos.close({ repoId }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.repos }),
  });
}

export function useRemoveWorktree(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { path: string; force: boolean }) => {
      const api = bridge();
      if (!api || !repoId) {
        return { ok: false as const, kind: 'error' as const, message: 'No repository selected.' };
      }
      return api.repos.worktreeRemove({ repoId, path: vars.path, force: vars.force });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.repos }),
  });
}

/**
 * How long a forge listing stays fresh.
 *
 * The app's global default is `staleTime: Infinity`, which is right for
 * everything the repo watcher can invalidate — it sees the filesystem, so it
 * knows when a refetch is warranted. It sees nothing of GitHub. A finite
 * window plus the section's own refresh button is the honest substitute; a
 * minute is short enough that a run finishing while you watch turns green on
 * the next glance, and long enough that expanding a repo does not spawn `gh`.
 */
const FORGE_STALE_MS = 60_000;

/** Whether `gh` is installed and signed in. Machine state, so not repo-keyed. */
export function useForgeCli() {
  return useQuery({
    queryKey: keys.forgeCli,
    queryFn: async () =>
      (await bridge()?.forge.cliStatus()) ?? {
        reason: 'not-installed' as const,
        binPath: null,
        hint: '',
      },
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * Recent workflow runs. `enabled` is the caller's promise that a human has
 * opened the section — every call is a `gh` subprocess and an API request
 * against the user's rate limit, so nothing here is speculative.
 */
export function useForgeRuns(repoId: string | null, enabled: boolean, branch?: string) {
  return useQuery<ForgeRunsResult>({
    queryKey: keys.forgeRuns(repoId ?? '', branch),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_RUNS;
      return api.forge.runs({ repoId, limit: 20, ...(branch ? { branch } : {}) });
    },
    enabled: enabled && repoId !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * Open issues. `enabled` carries the same promise as the runs query — a human
 * opened the section — for the same subprocess-and-rate-limit reason.
 */
export function useForgeIssues(repoId: string | null, enabled: boolean) {
  return useQuery<ForgeIssuesResult>({
    queryKey: keys.forgeIssues(repoId ?? '', 'open'),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_ISSUES;
      return api.forge.issues({ repoId, limit: 20, state: 'open' });
    },
    enabled: enabled && repoId !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * One run's job/step tree, fetched only once a row has been expanded.
 *
 * The same staleness window as its siblings, deliberately: a completed run is
 * immutable and main caches it outright, so re-asking costs nothing, while an
 * unfinished one main refuses to cache — and that is the run whose tree is
 * worth re-reading. The section's Refresh drops this key along with the listing
 * above it, since a re-fetched run list beside a stale job tree is the one
 * combination that would lie.
 */
export function useForgeRunDetail(repoId: string | null, runId: string | null, enabled: boolean) {
  return useQuery<ForgeRunDetailResult>({
    queryKey: keys.forgeRunDetail(repoId ?? '', runId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || !runId) return EMPTY_RUN_DETAIL;
      return api.forge.runDetail({ repoId, runId });
    },
    enabled: enabled && repoId !== null && runId !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * A run's whole log, in one fetch.
 *
 * The run, not the job: `gh run view --log` returns every job's output prefixed
 * with its job name, so one subprocess serves the whole tree and clicking
 * between jobs afterwards is free. `log-model.ts` does the splitting.
 *
 * `staleTime: Infinity` is right here and nowhere else in this file: GitHub
 * serves a log only for a *finished* run, so anything this resolves with is
 * already immutable. An unfinished run comes back `pending` and is re-asked
 * when the user refreshes.
 */
export function useForgeRunLog(
  repoId: string | null,
  runId: string | null,
  enabled: boolean,
  full = false,
  /**
   * What to show while this key loads — the capped answer, when asking for the
   * full one.
   *
   * The capped and un-capped fetches are different keys by design, so without
   * this the moment a caller flips to `full` its `data` is undefined and the
   * pane blanks. A placeholder keeps the log the user was already reading on
   * screen until the wider one arrives.
   */
  placeholderData?: ForgeRunLogResult,
) {
  return useQuery<ForgeRunLogResult>({
    queryKey: keys.forgeRunLog(repoId ?? '', runId ?? '', full),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || !runId) return EMPTY_RUN_LOG;
      return api.forge.runLog({ repoId, runId, full });
    },
    enabled: enabled && repoId !== null && runId !== null,
    staleTime: Infinity,
    ...(placeholderData === undefined ? {} : { placeholderData }),
  });
}

/**
 * Workflow definitions, for their `.yml` paths.
 *
 * Grouping runs never needs this — `ForgeRun.workflowId` comes free with the
 * listing — so it is fetched only where something needs to *link* to a
 * workflow file, and cached for a long window because a repository's set of
 * workflows changes when someone edits `.github/`, not while you are looking.
 */
export function useForgeWorkflows(repoId: string | null, enabled: boolean) {
  return useQuery<ForgeWorkflowsResult>({
    queryKey: keys.forgeWorkflows(repoId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_WORKFLOWS;
      return api.forge.workflows({ repoId });
    },
    enabled: enabled && repoId !== null,
    staleTime: 5 * 60_000,
  });
}

/**
 * `state` defaults to `open` — the sidebar section and the dashboard widget
 * both call this with no third/fourth argument and mean "what might I review
 * right now", exactly as Phase 17 shipped. The Reviews view is the one
 * caller that passes `'all'`, since its own status tabs do the filtering.
 *
 * `limit` grows the page rather than paging through one: `gh pr list` has no
 * cursor to page through, so the Reviews view's "Load more" is a second,
 * wider fetch under a new key — a subprocess only when the user actually
 * asks for more than the default page.
 */
export function useForgePulls(
  repoId: string | null,
  enabled: boolean,
  limit = 20,
  state: 'open' | 'closed' | 'merged' | 'all' = 'open',
) {
  return useQuery<ForgePullsResult>({
    queryKey: keys.forgePulls(repoId ?? '', limit, state),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_PULLS;
      return api.forge.pulls({ repoId, limit, state });
    },
    enabled: enabled && repoId !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * One PR's metadata, fetched when it is opened and never for a list.
 *
 * `enabled` carries the same promise as its siblings — a human opened this
 * pull request — because every one of these is a `gh` subprocess against the
 * user's rate limit.
 */
export function useForgePullDetail(repoId: string | null, number: number | null, enabled = true) {
  return useQuery<ForgePullDetailResult>({
    queryKey: keys.forgePullDetail(repoId ?? '', number ?? 0),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || number === null) return EMPTY_PULL_DETAIL;
      return api.forge.pullDetail({ repoId, number });
    },
    enabled: enabled && repoId !== null && number !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * One PR's diff, fetched only while the Files tab is mounted.
 *
 * The heaviest payload in this file, so `enabled` is what the tab strip drives:
 * a reader who opens a PR straight onto Conversation never fetches its patch.
 */
export function useForgePullFiles(repoId: string | null, number: number | null, enabled: boolean) {
  return useQuery<ForgePullFilesResult>({
    queryKey: keys.forgePullFiles(repoId ?? '', number ?? 0),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || number === null) return EMPTY_PULL_FILES;
      return api.forge.pullFiles({ repoId, number });
    },
    enabled: enabled && repoId !== null && number !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/** One PR's conversation, fetched only while the Conversation tab is mounted. */
export function useForgePullComments(
  repoId: string | null,
  number: number | null,
  enabled: boolean,
) {
  return useQuery<ForgePullCommentsResult>({
    queryKey: keys.forgePullComments(repoId ?? '', number ?? 0),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || number === null) return EMPTY_PULL_COMMENTS;
      return api.forge.pullComments({ repoId, number });
    },
    enabled: enabled && repoId !== null && number !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * One PR's inline review threads, fetched only while the Files tab is mounted.
 *
 * Same `enabled` discipline as the diff it decorates: a reader who opens a PR
 * onto Conversation or Checks never pays for a GraphQL round trip about lines
 * they are not looking at.
 */
export function useForgePullThreads(
  repoId: string | null,
  number: number | null,
  enabled: boolean,
) {
  return useQuery<ForgePullThreadsResult>({
    queryKey: keys.forgePullThreads(repoId ?? '', number ?? 0),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || number === null) return EMPTY_PULL_THREADS;
      return api.forge.pullThreads({ repoId, number });
    },
    enabled: enabled && repoId !== null && number !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/*
  ─── The three review writes (Phase 20 Theme E) ──────────────────────────────

  All three share one success rule: invalidate the thread key for that PR, and
  nothing else. A posted comment changes the threads and does not change the
  listing, the detail or the patch — invalidating the whole `forge(repoId)`
  prefix would re-spawn four subprocesses to redraw one panel.

  None of them throws on a refused write. `ForgeWriteResult` carries `ok` and
  `gh`'s own message, so the caller renders the failure next to the composer it
  came from, with the text the user typed still in it.
*/

/** Start a new inline thread on a line of a PR's diff. */
export function useAddReviewComment(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      commitId: string;
      path: string;
      line: number;
      position?: number;
      body: string;
    }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.reviewComment({ repoId, number, side: 'RIGHT', ...input });
    },
    onSuccess: (result) => {
      if (result.ok) invalidateThreads(client, repoId, number);
    },
  });
}

/** Reply into an existing inline thread, keyed by a comment's REST id. */
export function useReplyToReviewComment(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { commentId: string; body: string }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.reviewReply({ repoId, number, ...input });
    },
    onSuccess: (result) => {
      if (result.ok) invalidateThreads(client, repoId, number);
    },
  });
}

/** Mark an inline thread resolved, or reopen it. */
export function useSetThreadResolved(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      threadId: string;
      resolved: boolean;
    }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId) return NO_FORGE_WRITE;
      return api.forge.resolveThread({ repoId, ...input });
    },
    onSuccess: (result) => {
      if (result.ok) invalidateThreads(client, repoId, number);
    },
  });
}

function invalidateThreads(client: QueryClient, repoId: string | null, number: number | null): void {
  if (!repoId || number === null) return;
  void client.invalidateQueries({ queryKey: keys.forgePullThreads(repoId, number) });
}

/**
 * The bridge-less answer, shaped like a repository with no GitHub remote.
 *
 * Under vitest/jsdom there is no preload; a component should render its "no
 * forge here" state rather than an error, exactly as `useRepos` returns `[]`.
 */
const EMPTY_CLI = { reason: 'not-installed' as const, binPath: null, hint: '' };
const EMPTY_RUNS: ForgeRunsResult = { cli: EMPTY_CLI, runs: [], error: null };
const EMPTY_PULLS: ForgePullsResult = { cli: EMPTY_CLI, pulls: [], error: null };
const EMPTY_ISSUES: ForgeIssuesResult = {
  cli: EMPTY_CLI,
  issues: [],
  // Not `disabled`: with no bridge there is no repository to have issues
  // switched off, and claiming otherwise would render a definite answer to a
  // question nobody asked.
  disabled: false,
  error: null,
};
const EMPTY_RUN_DETAIL: ForgeRunDetailResult = { cli: EMPTY_CLI, detail: null, error: null };
const EMPTY_RUN_LOG: ForgeRunLogResult = {
  cli: EMPTY_CLI,
  log: null,
  // Not `pending`: with no bridge there is no run to still be going. Both
  // nulls with both flags false is "nothing to say", which is the truth.
  pending: false,
  error: null,
};
const EMPTY_WORKFLOWS: ForgeWorkflowsResult = { cli: EMPTY_CLI, workflows: [], error: null };
const EMPTY_PULL_DETAIL: ForgePullDetailResult = { cli: EMPTY_CLI, detail: null, error: null };
// Not an empty `files` object: with no bridge there is no pull request whose
// diff is empty, and `{files: []}` would render "no files changed" as a fact.
const EMPTY_PULL_FILES: ForgePullFilesResult = { cli: EMPTY_CLI, files: null, error: null };
const EMPTY_PULL_COMMENTS: ForgePullCommentsResult = { cli: EMPTY_CLI, comments: [], error: null };
const EMPTY_PULL_THREADS: ForgePullThreadsResult = { cli: EMPTY_CLI, threads: [], error: null };
/**
 * A write with no bridge: `ok: false`, and no error to report.
 *
 * Nothing failed — under vitest/jsdom there is no preload, so nothing was
 * attempted. An `error` string here would put a red message under a composer
 * in every component test that happens to mount one.
 */
const NO_FORGE_WRITE: ForgeWriteResult = { ok: false, cli: EMPTY_CLI, error: null };

/** Re-run the forge listings for one repo, on the user's say-so. */
export function useRefreshForge(repoId: string | null) {
  const client = useQueryClient();
  return () => {
    if (!repoId) return;
    void client.invalidateQueries({ queryKey: keys.forge(repoId) });
    // The probe too: the commonest reason a section is empty is that the user
    // has just run `gh auth login` in the terminal beside the app.
    void client.invalidateQueries({ queryKey: keys.forgeCli });
  };
}

// --- repository statistics (Phase 19) ---------------------------------------

/**
 * How long a statistics payload stays fresh.
 *
 * Far longer than a forge listing, and for the opposite reason: the expensive
 * part happens in main, which memoises on a digest of every ref tip, so a
 * refetch inside this window is usually a cache hit that still costs an IPC
 * round trip and a re-render of seven widgets. The watcher invalidates
 * `keys.stats` on a `refs` or `head` event, which is what actually makes the
 * board current.
 */
const STATS_STALE_MS = 5 * 60_000;

/**
 * Everything the dashboard draws, in one query.
 *
 * `withChurn` is part of the key rather than a flag on the payload: a board
 * that gains the contributors widget genuinely needs a DIFFERENT, more
 * expensive traversal, and sharing a cache entry between the two would serve
 * the cheap answer to the widget that asked for the expensive one — insertions
 * and deletions rendering as `null` forever.
 */
export function useRepoStats(
  repoId: string | null,
  window: StatsWindow,
  withChurn: boolean,
  enabled = true,
) {
  return useQuery<RepoStats>({
    queryKey: keys.statsSummary(repoId ?? '', window, withChurn),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return emptyStats(repoId ?? '', window);
      return api.stats.summary({ repoId, window, withChurn });
    },
    enabled: enabled && repoId !== null,
    staleTime: STATS_STALE_MS,
  });
}

/** Re-run the history traversal for one repo, on the user's say-so. */
export function useRefreshStats(repoId: string | null) {
  const client = useQueryClient();
  return () => {
    if (!repoId) return;
    void client.invalidateQueries({ queryKey: keys.stats(repoId) });
  };
}

/**
 * The bridge-less answer, shaped like a repository with no history.
 *
 * Under vitest/jsdom there is no preload, and every widget already renders its
 * empty state — so this is what makes a dashboard component testable without a
 * mock bridge, exactly as `EMPTY_RUNS` does for the forge sections.
 */
const emptyStats = (repoId: string, window: StatsWindow): RepoStats => ({
  repoId,
  window,
  generatedAt: 0,
  truncated: false,
  commitsScanned: 0,
  calendar: [],
  contributors: [],
  activity: [],
  churn: null,
  health: {
    localBranches: 0,
    remoteBranches: 0,
    tags: 0,
    staleByAge: 0,
    mergedBranches: 0,
    oldestUnmergedAt: null,
    sizeBytes: null,
    looseObjects: null,
  },
});

// --- repo diagnostics (Phase 18) --------------------------------------------

/**
 * The renderer is where a diagnostics result lives.
 *
 * Main runs the linter and forgets it. Everything about that is deliberate:
 * a cached count in main would need a staleness rule nobody has written, and
 * persisting one would break `repo-store.ts`'s standing rule that only
 * un-derivable state is written to disk. A lint result read from disk at boot
 * describes a working tree that has since changed — worse than no answer,
 * because the footer would state it with the same confidence as a fresh one.
 *
 * So: `staleTime: Infinity` and no automatic refetch anywhere. The result
 * stands until a human asks for another, which is also what makes the trust
 * grant mean something — one approval is not standing permission to re-run on
 * every save.
 */

/** Whether this repo may run its linter, and whether the grant still applies. */
export function useDiagTrust(repoId: string | null) {
  return useQuery<DiagnosticsTrustStatus>({
    queryKey: keys.diagTrust(repoId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return NO_DIAG_TRUST;
      return api.diag.trustStatus({ repoId });
    },
    enabled: repoId !== null,
    staleTime: Infinity,
  });
}

/**
 * What could be run here, ranked.
 *
 * Safe to fetch unprompted — detection reads the filesystem and executes
 * nothing — but `enabled` still gates it on the caller actually needing the
 * list, because nothing should stat a repo's `node_modules` to render a footer.
 */
export function useDiagCandidates(repoId: string | null, enabled: boolean) {
  return useQuery<DiagnosticsCandidate[]>({
    queryKey: keys.diagDetect(repoId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return [];
      return (await api.diag.detect({ repoId })).candidates;
    },
    enabled: enabled && repoId !== null,
    staleTime: Infinity,
  });
}

/**
 * The last result, for as long as the renderer is alive.
 *
 * `enabled: false` throughout: this query never fetches on its own. The cache
 * entry is written by `useRunDiagnostics` below, so `data === undefined` means
 * "not measured", which is the state the footer must render as *absent* rather
 * than as a clean repo. A `staleTime` would not be enough on its own — a
 * mounting component would still trigger a spawn.
 */
export function useDiagResult(repoId: string | null) {
  return useQuery<DiagnosticsRun>({
    queryKey: keys.diagRun(repoId ?? ''),
    enabled: false,
    staleTime: Infinity,
    // Never called while `enabled` is false, and deliberately loud if that ever
    // changes: the alternative — a queryFn that spawns, or one that fabricates
    // a result — would either execute the repo's linter without anyone asking
    // or turn "never measured" into a value, which is the one distinction the
    // footer must not lose.
    queryFn: () => {
      throw new Error('diagnostics results are written by useRunDiagnostics, never fetched');
    },
  });
}

/** Approve one command. The caller must have shown the user its literal text. */
export function useTrustDiagnostics(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (command: DiagnosticsCommand) => {
      const api = bridge();
      if (!api || !repoId) return NO_DIAG_TRUST;
      return api.diag.trust({ repoId, command });
    },
    onSuccess: (status) => {
      if (repoId) client.setQueryData(keys.diagTrust(repoId), status);
    },
  });
}

/** Revoke. The stale result goes with it — it describes a run no longer sanctioned. */
export function useUntrustDiagnostics(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const api = bridge();
      if (!api || !repoId) return NO_DIAG_TRUST;
      return api.diag.untrust({ repoId });
    },
    onSuccess: (status) => {
      if (!repoId) return;
      client.setQueryData(keys.diagTrust(repoId), status);
      client.removeQueries({ queryKey: keys.diagRun(repoId) });
    },
  });
}

/**
 * Run the linter, on the user's say-so and never otherwise.
 *
 * A mutation rather than a query with a refetch, because that is what it is:
 * it spawns a process. Modelling it as a query would invite `refetchOnMount`,
 * `refetchOnWindowFocus` and every other well-meaning default to execute the
 * repository's code without anyone asking.
 */
export function useRunDiagnostics(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const api = bridge();
      if (!api || !repoId) return NO_DIAG_BRIDGE;
      return api.diag.run({ repoId });
    },
    onSuccess: (result) => {
      if (repoId) client.setQueryData(keys.diagRun(repoId), result);
    },
  });
}

/**
 * The bridge-less answers, shaped like a repo with nothing configured.
 *
 * Under vitest/jsdom there is no preload, and the footer should render its
 * resting state rather than an error — the same reason `EMPTY_RUNS` exists.
 */
const NO_DIAG_TRUST: DiagnosticsTrustStatus = {
  state: 'no-command',
  command: null,
  trustedAt: null,
};
const NO_DIAG_BRIDGE: DiagnosticsRun = {
  ok: false,
  reason: 'no-command',
  hint: 'Diagnostics are unavailable here.',
};

// --- repository tests (Phase 19) ---------------------------------------------

const EMPTY_DISCOVERY = (repoId: string): TestDiscovery => ({ repoId, packages: [], generatedAt: 0 });
const NO_TEST_TRUST: TestTrustStatus = { state: 'untrusted', trustedAt: null };

/** Suites this checkout declares. Safe unprompted — discovery runs nothing. */
export function useTestDiscovery(repoId: string | null) {
  return useQuery<TestDiscovery>({
    queryKey: keys.testsDiscover(repoId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_DISCOVERY(repoId ?? '');
      return api.tests.discover({ repoId });
    },
    enabled: repoId !== null,
    // Matches the discovery cache's own TTL — asking more often than that
    // buys nothing, since main answers from the same cached pass.
    staleTime: 60_000,
  });
}

export function useRefreshTestDiscovery(repoId: string | null) {
  const client = useQueryClient();
  return () => {
    if (!repoId) return;
    void client.invalidateQueries({ queryKey: keys.testsDiscover(repoId) });
  };
}

/** Whether one suite is trusted to run, and whether the grant still applies. */
export function useTestTrustStatus(repoId: string | null, suiteId: string | null) {
  return useQuery<TestTrustStatus>({
    queryKey: keys.testsTrust(repoId ?? '', suiteId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || !suiteId) return NO_TEST_TRUST;
      return api.tests.trustStatus({ repoId, suiteId });
    },
    enabled: repoId !== null && suiteId !== null,
    staleTime: Infinity,
  });
}

/** Approve one suite. The caller must have shown the user its literal command. */
export function useTrustTestSuite(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ suiteId, fingerprint }: { suiteId: string; fingerprint: string }) => {
      const api = bridge();
      if (!api || !repoId) return NO_TEST_TRUST;
      return api.tests.trust({ repoId, suiteId, fingerprint });
    },
    onSuccess: (status, { suiteId }) => {
      if (repoId) client.setQueryData(keys.testsTrust(repoId, suiteId), status);
    },
  });
}

export function useUntrustTestSuite(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (suiteId: string) => {
      const api = bridge();
      if (!api || !repoId) return NO_TEST_TRUST;
      return api.tests.untrust({ repoId, suiteId });
    },
    onSuccess: (status, suiteId) => {
      if (repoId) client.setQueryData(keys.testsTrust(repoId, suiteId), status);
    },
  });
}

/**
 * Start a trusted suite. Resolves with a run id immediately — the run itself
 * plays out on `tests.onOutput`/`tests.onResult`, which `tests-store.ts`
 * subscribes to once, in the Tests view.
 */
export function useRunTestSuite(repoId: string | null) {
  return useMutation({
    mutationFn: async (suiteId: string) => {
      const api = bridge();
      if (!api || !repoId) return { ok: false as const, reason: 'no bridge' };
      return api.tests.run({ repoId, suiteId });
    },
  });
}

export function useCancelTestRun() {
  return (runId: string) => bridge()?.tests.cancel({ runId });
}
