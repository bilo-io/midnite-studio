import { bridge } from '@midnite/studio-frame';
import type {
  ForgeCapability,
  ForgeIssueCommentsResult,
  ForgeIssueCreateResult,
  ForgeIssueDetailResult,
  ForgeIssuesResult,
  ForgeKind,
  ForgeLinkKind,
  ForgeLinkWriteResult,
  ForgeMergeMethod,
  ForgeProjectCreateResult,
  ForgeProjectFieldValue,
  ForgeProjectFieldsResult,
  ForgeProjectItem,
  ForgeProjectReadKind,
  ForgeProjectWriteResult,
  ForgeProjectsResult,
  ForgePullCommentsResult,
  ForgePullDetailResult,
  ForgePullFilesResult,
  ForgePullScope,
  ForgePullThreadsResult,
  ForgePullsResult,
  ForgeReviewEvent,
  ForgeRunDetailResult,
  ForgeRunLogResult,
  ForgeRunsResult,
  ForgeSubscriptionKind,
  ForgeWorkflowsResult,
  ForgeWriteResult,
} from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';


/*
  The forge's renderer data layer (Phase 113 Theme O): the query keys and the
  hooks Reviews and Actions read, moved verbatim out of the app's
  `services/queries.ts`, which re-exports them — so the Studio views that read
  the same data (the repos sidebar's forge sections, the graph's CI column, the
  status-bar checks chip, Tasks) import them exactly as before, and every key
  tuple is unchanged. Everything here reaches main through the frame's bridge.
*/

/**
 * The forge query keys — moved verbatim from the app's `keys` (Phase 113 Theme O), which spreads
 * them back in, so every key tuple is exactly what it was.
 */
export const forgeKeys = {
  forgeIssues: (repoId: string, limit = 20, state = 'open') =>
    ['repos', repoId, 'forge', 'issues', limit, state] as const,
  /**
   * One opened issue's two payloads — its metadata+body and its conversation.
   *
   * Two keys, not one, for the same reason `forgePullDetail`/`forgePullComments`
   * are two: a reader who opens an issue pays for its body immediately (it's the
   * point of opening it) but the comment thread is worth its own key so a
   * successful comment/close-reopen write can invalidate just the piece that
   * changed.
   */
  forgeIssueDetail: (repoId: string, number: number) =>
    ['repos', repoId, 'forge', 'issue-detail', number] as const,
  forgeIssueComments: (repoId: string, number: number) =>
    ['repos', repoId, 'forge', 'issue-comments', number] as const,
  /**
   * The ProjectV2 boards visible to the open repo's owner (Phase 40 Theme C).
   *
   * Under the repo prefix, like every other forge listing, so closing the
   * repo drops it. Deliberately NOT under `forge` (`keys.forge(repoId)`): a
   * board belongs to the owner, not to the repository's runs/pulls/issues, and
   * this phase's field-write invalidation (Theme E) needs to drop exactly one
   * board's fields/items without touching the run listing beside it.
   */
  forgeProjects: (repoId: string) => ['repos', repoId, 'forge-project', 'list'] as const,
  /**
   * One board's field definitions.
   *
   * Keyed by `projectId` alone, outside the `repos/<id>` prefix — a ProjectV2
   * board belongs to a user or an organization, never to a repository (see
   * `forge-project-handlers.ts`'s own note), so nothing about which repo is
   * open bears on its fields. Closing the repo therefore does not drop this;
   * it simply stops being asked for until another repo's Projects view picks
   * the same board again, at which point `FORGE_STALE_MS` decides freshness.
   */
  forgeProjectFields: (projectId: string) => ['forge-project', projectId, 'fields'] as const,
  /** One board's items — see `forgeProjectFields` for why this is not repo-scoped. */
  forgeProjectItems: (projectId: string) => ['forge-project', projectId, 'items'] as const,
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
  forgePulls: (repoId: string, limit = 20, state = 'open', scope: ForgePullScope = 'all') =>
    ['repos', repoId, 'forge', 'pulls', limit, state, scope] as const,
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
  forgeCommitRuns: (repoId: string, shas: readonly string[]) =>
    ['repos', repoId, 'forge', 'commit-runs', shas.join(',')] as const,
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
  /** The account registry (Phase 90 Theme B). Not repo-scoped — an account
   *  is a machine-wide identity, like `forgeCli` above. */
  forgeAccounts: ['forge', 'accounts'] as const,
  /** A provider kind's capability matrix — a placeholder until Theme H. */
  forgeCapabilities: (kind: string) => ['forge', 'capabilities', kind] as const,
  /** One account's reachable-repos listing (Theme C) — keyed by account id,
   *  not repo-scoped, like `forgeAccounts` above. */
  forgeAccountReachableRepos: (accountId: string) =>
    ['forge', 'accounts', accountId, 'reachable-repos'] as const,
};

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
export const FORGE_STALE_MS = 60_000;

/**
 * Invalidate every query nested under one forge kind's prefix — the reaction
 * to a `forgeChanged` ping (Phase 84 Theme C.5/C.6): a poll cannot know which
 * item is open, so it invalidates the listing plus every detail/comments/log
 * key nested under it (`forgeRunDetail`, `forgePullComments`, …), and lets
 * React Query's own "only active queries actually refetch" rule limit the
 * real cost to whatever pane is actually open. `pull-files` (the diff) is
 * deliberately left out — it stays uncached, as it always has been (see
 * `useForgePullFiles`) — and `forge-project` fields/items are not repo-scoped
 * at all (`forgeProjectFields`/`forgeProjectItems`), so a repo-scoped ping
 * only ever touches the board list.
 */
export function invalidateForgeKind(
  client: QueryClient,
  repoId: string,
  kind: ForgeSubscriptionKind,
): void {
  switch (kind) {
    case 'runs':
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'runs'] });
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'run-detail'] });
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'run-log'] });
      return;
    case 'pulls':
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'pulls'] });
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'pull-detail'] });
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'pull-comments'] });
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'pull-threads'] });
      return;
    case 'issues':
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'issues'] });
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'issue-detail'] });
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'issue-comments'] });
      return;
    case 'projects':
      void client.invalidateQueries({ queryKey: forgeKeys.forgeProjects(repoId) });
      return;
  }
}

export function useForgeCapabilities(kind: ForgeKind) {
  return useQuery<ForgeCapability>({
    queryKey: forgeKeys.forgeCapabilities(kind),
    queryFn: async () =>
      (await bridge()?.forgeAccounts.capabilities({ kind })) ?? {
        pulls: 'none',
        issues: 'none',
        checks: 'none',
        projects: 'none',
        threadResolution: 'none',
        requestChanges: 'none',
        repoListing: 'none',
        // Phase 95 Theme D's per-operation matrix — every op off, matching
        // `NO_CAPABILITY`'s own row for a kind with no adapter at all.
        ops: {
          createIssue: false,
          editIssue: false,
          deleteIssue: false,
          createProject: false,
          editProject: false,
          deleteProject: false,
          addProjectItem: false,
          removeProjectItem: false,
          linkBlockedBy: false,
          linkSubIssue: false,
        },
      },
    staleTime: Infinity,
  });
}

/**
 * Recent workflow runs. `enabled` is the caller's promise that a human has
 * opened the section — every call is a `gh` subprocess and an API request
 * against the user's rate limit, so nothing here is speculative.
 */
export function useForgeRuns(repoId: string | null, enabled: boolean, branch?: string) {
  return useQuery<ForgeRunsResult>({
    queryKey: forgeKeys.forgeRuns(repoId ?? '', branch),
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
 * One run's job/step tree, fetched only once a row has been expanded.
 *
 * The same staleness window as its siblings, deliberately: a completed run is
 * immutable and main caches it outright, so re-asking costs nothing, while an
 * unfinished one main refuses to cache — and that is the run whose tree is
 * worth re-reading. The section's Refresh drops this key along with the listing
 * above it, since a re-fetched run list beside a stale job tree is the one
 * combination that would lie.
 */
export function useForgeRunDetail(
  repoId: string | null,
  runId: string | null,
  enabled: boolean,
  /**
   * Re-read the tree on this interval, or never (`false`, the default). The
   * graph's run modal passes one while the run it shows is still moving and
   * the window is on screen; the Actions page never does — see its own note on
   * why refresh there is explicit.
   */
  refetchInterval: number | false = false,
) {
  return useQuery<ForgeRunDetailResult>({
    queryKey: forgeKeys.forgeRunDetail(repoId ?? '', runId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || !runId) return EMPTY_RUN_DETAIL;
      return api.forge.runDetail({ repoId, runId });
    },
    enabled: enabled && repoId !== null && runId !== null,
    staleTime: FORGE_STALE_MS,
    refetchInterval,
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
    queryKey: forgeKeys.forgeRunLog(repoId ?? '', runId ?? '', full),
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
    queryKey: forgeKeys.forgeWorkflows(repoId ?? ''),
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
 *
 * `scope` is part of the key for the same reason `state` is: "my pull requests"
 * and "every pull request" are two different `gh` calls with two different
 * answers, and the Reviews groups show them side by side. Sharing a key would
 * let whichever group expanded first serve its rows to the other two.
 */
export function useForgePulls(
  repoId: string | null,
  enabled: boolean,
  limit = 20,
  state: 'open' | 'closed' | 'merged' | 'all' = 'open',
  scope: ForgePullScope = 'all',
) {
  return useQuery<ForgePullsResult>({
    queryKey: forgeKeys.forgePulls(repoId ?? '', limit, state, scope),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_PULLS;
      return api.forge.pulls({ repoId, limit, state, scope });
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
    queryKey: forgeKeys.forgePullDetail(repoId ?? '', number ?? 0),
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
    queryKey: forgeKeys.forgePullFiles(repoId ?? '', number ?? 0),
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
    queryKey: forgeKeys.forgePullComments(repoId ?? '', number ?? 0),
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
    queryKey: forgeKeys.forgePullThreads(repoId ?? '', number ?? 0),
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

export function invalidateThreads(client: QueryClient, repoId: string | null, number: number | null): void {
  if (!repoId || number === null) return;
  void client.invalidateQueries({ queryKey: forgeKeys.forgePullThreads(repoId, number) });
}

/*
  ─── The six review write actions (Phase 20 Themes F and G) ──────────────────

  Same envelope discipline as Theme E's three above: none of these throws, all
  of them answer `ForgeWriteResult`, and the caller renders `gh`'s own sentence
  beside the control that caused it.

  Where they differ is what a success invalidates. A posted thread changes only
  the threads; a *review* changes the PR's `reviewDecision`, which the listing
  row and the detail header both draw, so those have to be re-read. The
  invalidator below is scoped to that — the listing and the one PR's detail —
  rather than the whole `forge(repoId)` prefix, which would also re-spawn the
  runs, workflows and issues subprocesses for a state none of them reflect.

  None of them is optimistic. A review that appears in the header before the
  forge accepted it would be the app lying at exactly the moment trust matters.
*/

/**
 * What a review verdict changed: this PR's own facts, and its row in the list.
 *
 * The *patch* is deliberately not invalidated. Approving a pull request does
 * not alter its diff, and re-fetching a capped patch is the most expensive read
 * in this file.
 */
export function invalidatePullState(
  client: QueryClient,
  repoId: string | null,
  number: number | null,
): void {
  if (!repoId) return;
  if (number !== null) {
    void client.invalidateQueries({ queryKey: forgeKeys.forgePullDetail(repoId, number) });
  }
  /*
    Prefix-matched, not exact.

    `forgeKeys.forgePulls` is keyed by limit AND state, and the list, the sidebar
    section and the dashboard widget each ask with different values — so an
    exact key would refresh whichever one happened to match and leave a stale
    "Changes requested" pill in the other two.
  */
  void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'pulls'] });
}

/** Submit a review: approve, request changes, or comment. */
export function useReviewPull(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      event: ForgeReviewEvent;
      body: string;
    }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.pullReview({ repoId, number, ...input });
    },
    onSuccess: (result) => {
      if (result.ok) invalidatePullState(client, repoId, number);
    },
  });
}

/**
 * Post a top-level conversation comment.
 *
 * Invalidates the conversation rather than the PR's state, because that is what
 * changed: a discussion comment carries no verdict, so the listing row's review
 * pill is the same as it was.
 */
export function useCommentPull(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.pullComment({ repoId, number, ...input });
    },
    onSuccess: (result) => {
      if (!result.ok || !repoId || number === null) return;
      void client.invalidateQueries({ queryKey: forgeKeys.forgePullComments(repoId, number) });
    },
  });
}

/** Merge the pull request. The dialog confirms before this is reached. */
export function useMergePull(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { method: ForgeMergeMethod }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.pullMerge({ repoId, number, ...input });
    },
    onSuccess: (result) => {
      if (result.ok) invalidatePullState(client, repoId, number);
    },
  });
}

/** Ask one or more logins for a review — the same call re-asks an existing one. */
export function useRequestReview(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reviewers: string[] }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.pullRequestReview({ repoId, number, ...input });
    },
    onSuccess: (result) => {
      if (result.ok) invalidatePullState(client, repoId, number);
    },
  });
}

/** Take a draft pull request out of draft. */
export function useMarkPullReady(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.pullReady({ repoId, number });
    },
    onSuccess: (result) => {
      if (result.ok) invalidatePullState(client, repoId, number);
    },
  });
}

/**
 * Re-run a workflow run, or only its failed jobs.
 *
 * Invalidates both the run listing and that run's detail, because `gh run rerun`
 * adds an attempt to the *same* run id rather than creating a new one: the
 * listing's status and conclusion go stale, and so does the job tree. Main
 * evicts its own cache for the same reason — see `forgetRun` — since a query
 * invalidation alone would re-fetch and be served the previous attempt.
 *
 * Both keys are prefix-matched, for the same reason as the pull listing:
 * `forgeKeys.forgeRuns` is keyed by branch and `forgeKeys.forgeRunDetail` by run id, and
 * the Checks tab asks per-branch while the Actions view asks for all.
 */
export function useRerunChecks(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      runId: string;
      failedOnly: boolean;
    }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId) return NO_FORGE_WRITE;
      return api.forge.runRerun({ repoId, ...input });
    },
    onSuccess: (result, input) => {
      if (!result.ok || !repoId) return;
      void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'runs'] });
      void client.invalidateQueries({ queryKey: forgeKeys.forgeRunDetail(repoId, input.runId) });
    },
  });
}

/**
 * The bridge-less answer, shaped like a repository with no GitHub remote.
 *
 * Under vitest/jsdom there is no preload; a component should render its "no
 * forge here" state rather than an error, exactly as `useRepos` returns `[]`.
 */
export const EMPTY_CLI = { reason: 'not-installed' as const, binPath: null, hint: '' };
export const EMPTY_RUNS: ForgeRunsResult = { cli: EMPTY_CLI, runs: [], error: null };
export const EMPTY_PULLS: ForgePullsResult = { cli: EMPTY_CLI, pulls: [], error: null };
export const EMPTY_RUN_DETAIL: ForgeRunDetailResult = { cli: EMPTY_CLI, detail: null, error: null };
export const EMPTY_RUN_LOG: ForgeRunLogResult = {
  cli: EMPTY_CLI,
  log: null,
  // Not `pending`: with no bridge there is no run to still be going. Both
  // nulls with both flags false is "nothing to say", which is the truth.
  pending: false,
  error: null,
};
export const EMPTY_WORKFLOWS: ForgeWorkflowsResult = { cli: EMPTY_CLI, workflows: [], error: null };
export const EMPTY_PULL_DETAIL: ForgePullDetailResult = { cli: EMPTY_CLI, detail: null, error: null };
// Not an empty `files` object: with no bridge there is no pull request whose
// diff is empty, and `{files: []}` would render "no files changed" as a fact.
export const EMPTY_PULL_FILES: ForgePullFilesResult = { cli: EMPTY_CLI, files: null, error: null };
export const EMPTY_PULL_COMMENTS: ForgePullCommentsResult = { cli: EMPTY_CLI, comments: [], error: null };
export const EMPTY_PULL_THREADS: ForgePullThreadsResult = { cli: EMPTY_CLI, threads: [], error: null };
export const EMPTY_PROJECTS: ForgeProjectsResult = { cli: EMPTY_CLI, projects: [], error: null, kind: 'ok' };
/**
 * A write with no bridge: `ok: false`, and no error to report.
 *
 * Nothing failed — under vitest/jsdom there is no preload, so nothing was
 * attempted. An `error` string here would put a red message under a composer
 * in every component test that happens to mount one.
 */
export const NO_FORGE_WRITE: ForgeWriteResult = { ok: false, cli: EMPTY_CLI, error: null };
/** Same reasoning as `NO_FORGE_WRITE`, for the `ForgeProjectWriteResult` shape. */
export const NO_FORGE_PROJECT_WRITE: ForgeProjectWriteResult = { ok: false, kind: 'error', message: '' };
/** Same reasoning as `NO_FORGE_WRITE`, for the `ForgeProjectWriteResult` shape. */

/** Re-run the forge listings for one repo, on the user's say-so. */
export function useRefreshForge(repoId: string | null) {
  const client = useQueryClient();
  return () => {
    if (!repoId) return;
    void client.invalidateQueries({ queryKey: forgeKeys.forge(repoId) });
    // The probe too: the commonest reason a section is empty is that the user
    // has just run `gh auth login` in the terminal beside the app.
    void client.invalidateQueries({ queryKey: forgeKeys.forgeCli });
  };
}

/**
 * Subscribe a `{repoId, kind}` forge listing to main's poller while the view
 * that shows it is mounted (Phase 84 Theme C) — moved with the hooks above from
 * the app's `services/use-forge-subscription.ts`, which re-exports it.
 */
export function useForgeSubscription(repoId: string | null, kind: ForgeSubscriptionKind, enabled = true): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled || repoId === null) return undefined;
    const api = bridge();
    if (!api) return undefined;

    api.forge.subscribe({ repoId, kind });
    const unsubscribeChanged = api.forge.onChanged((event) => {
      if (event.repoId !== repoId || event.kind !== kind) return;
      invalidateForgeKind(client, repoId, kind);
    });

    return () => {
      unsubscribeChanged();
      api.forge.unsubscribe({ repoId, kind });
    };
  }, [repoId, kind, enabled, client]);
}

/*
  ─── Issues and boards (Phase 113 Theme O) ───────────────────────────────────

  Moved verbatim out of the app's `services/queries.ts` (which re-exports them) so
  Midnite Coder can hand the same hooks to the Tasks feature's host port: a
  feature never imports another feature, so Tasks reads these through
  `TasksHost.data`, which Studio and Coder both fill from here.
*/

const EMPTY_ISSUES: ForgeIssuesResult = {
  cli: EMPTY_CLI,
  issues: [],
  // Not `disabled`: with no bridge there is no repository to have issues
  // switched off, and claiming otherwise would render a definite answer to a
  // question nobody asked.
  disabled: false,
  error: null,
};
const EMPTY_ISSUE_DETAIL: ForgeIssueDetailResult = { cli: EMPTY_CLI, issue: null, error: null };
const EMPTY_ISSUE_COMMENTS: ForgeIssueCommentsResult = { cli: EMPTY_CLI, comments: [], error: null };
const EMPTY_PROJECT_FIELDS: ForgeProjectFieldsResult = {
  cli: EMPTY_CLI,
  fields: [],
  error: null,
  kind: 'ok',
};
const EMPTY_PROJECT_ITEMS_PAGE: ForgeProjectItemsPage = {
  cli: EMPTY_CLI,
  items: [],
  truncated: false,
  error: null,
  kind: 'ok',
};
const NO_FORGE_ISSUE_CREATE: ForgeIssueCreateResult = { ok: false, cli: EMPTY_CLI, error: null };
const NO_FORGE_PROJECT_CREATE: ForgeProjectCreateResult = { ok: false, kind: 'error', message: '' };

/**
 * The ProjectV2 boards visible to the open repo's owner (Phase 40 Theme C).
 *
 * `enabled` carries the same promise every forge read does: a human opened
 * the Projects view. No fetch happens on arrival — the acceptance test this
 * phase ships (`tasks-view.test.tsx`) is built on exactly that gate.
 */
export function useForgeProjects(repoId: string | null, enabled: boolean) {
  return useQuery<ForgeProjectsResult>({
    queryKey: forgeKeys.forgeProjects(repoId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_PROJECTS;
      return api.forgeProject.list({ repoId });
    },
    enabled: enabled && repoId !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * Attach an existing pull request to a ProjectV2 board (Phase 50 Theme E).
 *
 * Unlike its two siblings above, this one takes no bound `projectId` — "Add
 * to project" from the Reviews page picks the board at call time, from
 * whichever one the user selects in the menu, so `projectId` travels with
 * each `mutate()` call instead of being fixed for the hook's lifetime.
 */
export function useAddProjectItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; contentId: string }): Promise<ForgeProjectWriteResult> => {
      const api = bridge();
      if (!api) return NO_FORGE_PROJECT_WRITE;
      return api.forgeProject.addItem(input);
    },
    onSuccess: (result, input) => {
      if (result.ok) {
        void client.invalidateQueries({ queryKey: forgeKeys.forgeProjectItems(input.projectId) });
      }
    },
  });
}

/**
 * Issues. `enabled` carries the same promise as the runs query — a human
 * opened the section — for the same subprocess-and-rate-limit reason.
 *
 * Defaults match the sidebar section's and dashboard widget's original
 * "what's open right now" ask; the Issues view (Phase 54 Theme C) is the one
 * caller that raises `limit` and passes `state: 'all'` — its own filter
 * toolbar (Theme E) is what narrows it back down, the same relationship
 * `useForgePulls`'s `state` param has with the Reviews view's status tabs.
 */
export function useForgeIssues(
  repoId: string | null,
  enabled: boolean,
  limit = 20,
  state: 'open' | 'closed' | 'all' = 'open',
) {
  return useQuery<ForgeIssuesResult>({
    queryKey: forgeKeys.forgeIssues(repoId ?? '', limit, state),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_ISSUES;
      return api.forge.issues({ repoId, limit, state });
    },
    enabled: enabled && repoId !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * One issue's metadata and body, fetched when it is opened and never for a list.
 *
 * `enabled` carries the same promise as its PR-detail sibling — every one of
 * these is a `gh` subprocess against the user's rate limit.
 */
export function useForgeIssueDetail(repoId: string | null, number: number | null, enabled = true) {
  return useQuery<ForgeIssueDetailResult>({
    queryKey: forgeKeys.forgeIssueDetail(repoId ?? '', number ?? 0),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || number === null) return EMPTY_ISSUE_DETAIL;
      return api.forge.issueDetail({ repoId, number });
    },
    enabled: enabled && repoId !== null && number !== null,
    staleTime: FORGE_STALE_MS,
  });
}

export function useForgeIssueComments(
  repoId: string | null,
  number: number | null,
  enabled: boolean,
) {
  return useQuery<ForgeIssueCommentsResult>({
    queryKey: forgeKeys.forgeIssueComments(repoId ?? '', number ?? 0),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId || number === null) return EMPTY_ISSUE_COMMENTS;
      return api.forge.issueComments({ repoId, number });
    },
    enabled: enabled && repoId !== null && number !== null,
    staleTime: FORGE_STALE_MS,
  });
}

export function useForgeProjectFields(projectId: string | null, enabled: boolean) {
  return useQuery<ForgeProjectFieldsResult>({
    queryKey: forgeKeys.forgeProjectFields(projectId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !projectId) return EMPTY_PROJECT_FIELDS;
      return api.forgeProject.fields({ projectId });
    },
    enabled: enabled && projectId !== null,
    staleTime: FORGE_STALE_MS,
  });
}

const PROJECT_ITEMS_PAGE_CEILING = 10;

export type ForgeProjectItemsPage = {
  cli: ForgeProjectsResult['cli'];
  items: ForgeProjectItem[];
  /** Hit the 1 000-item ceiling with more still on the board — see the phase doc. */
  truncated: boolean;
  error: string | null;
  kind: ForgeProjectReadKind;
};

/**
 * A board's items, walked sequentially to a documented ceiling.
 *
 * `mstudio:forge-project:items` is a *page* channel — one `gh` subprocess per
 * call, cursor in, cursor out (Theme A's own request/response shape). The
 * sequential walk the phase doc asks for ("fetch pages sequentially… never
 * per-row") lives here rather than in main, because a cursor forces
 * sequential fetching anyway and this is the one place react-query already
 * owns staleness for the combined result. Capped at
 * `PROJECT_ITEMS_PAGE_CEILING` pages (1 000 items at 100/page) — past it the
 * walk stops and `truncated` is set, which `TasksView` renders rather than
 * silently dropping the rest of the board.
 */
export function useForgeProjectItems(projectId: string | null, enabled: boolean) {
  return useQuery<ForgeProjectItemsPage>({
    queryKey: forgeKeys.forgeProjectItems(projectId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !projectId) return EMPTY_PROJECT_ITEMS_PAGE;

      let cursor: string | undefined;
      let items: ForgeProjectItem[] = [];
      let truncated = false;
      let page: ForgeProjectItemsPage = EMPTY_PROJECT_ITEMS_PAGE;

      for (let pageIndex = 0; pageIndex < PROJECT_ITEMS_PAGE_CEILING; pageIndex += 1) {
        const result = await api.forgeProject.items({ projectId, ...(cursor ? { cursor } : {}) });
        page = { cli: result.cli, items: [], truncated: false, error: result.error, kind: result.kind };
        if (result.error) break;

        items = [...items, ...result.items];
        if (result.nextCursor === null) break;

        cursor = result.nextCursor;
        if (pageIndex === PROJECT_ITEMS_PAGE_CEILING - 1) truncated = true;
      }

      return { ...page, items, truncated };
    },
    enabled: enabled && projectId !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * Set one item's field value (Phase 40 Theme E).
 *
 * **Not optimistic** — the house rule `useSetThreadResolved` already follows:
 * the mutation never throws, so `onSuccess` fires on a refusal too, and only
 * `result.ok` decides whether to invalidate. Invalidated narrowly: this
 * board's items (what the edited cell renders from) — never the whole forge,
 * and never `forgeProjectFields`, which a field-*value* write never changes.
 */
export function useSetProjectItemField(projectId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      itemId: string;
      fieldId: string;
      value: ForgeProjectFieldValue;
    }): Promise<ForgeProjectWriteResult> => {
      const api = bridge();
      if (!api || !projectId) return NO_FORGE_PROJECT_WRITE;
      return api.forgeProject.setField({ projectId, ...input });
    },
    onSuccess: (result) => {
      if (result.ok && projectId) {
        void client.invalidateQueries({ queryKey: forgeKeys.forgeProjectItems(projectId) });
      }
    },
  });
}

/**
 * Clear one item's field value entirely (Phase 50 Theme C) — a sibling to
 * `useSetProjectItemField` rather than a branch inside it: `clearField` takes
 * no `value` at all, so folding the two into one mutation would mean an
 * input shape that is sometimes wrong for the channel it calls. Same "not
 * optimistic, invalidate narrowly" posture as its sibling.
 */
export function useClearProjectItemField(projectId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { itemId: string; fieldId: string }): Promise<ForgeProjectWriteResult> => {
      const api = bridge();
      if (!api || !projectId) return NO_FORGE_PROJECT_WRITE;
      return api.forgeProject.clearField({ projectId, ...input });
    },
    onSuccess: (result) => {
      if (result.ok && projectId) {
        void client.invalidateQueries({ queryKey: forgeKeys.forgeProjectItems(projectId) });
      }
    },
  });
}

function invalidateIssueState(
  client: QueryClient,
  repoId: string | null,
  number: number | null,
): void {
  if (!repoId) return;
  if (number !== null) {
    void client.invalidateQueries({ queryKey: forgeKeys.forgeIssueDetail(repoId, number) });
  }
  // Prefix-matched: `forgeKeys.forgeIssues` is keyed by limit AND state, and the
  // sidebar section, the dashboard widget and the Issues view each ask with
  // different values.
  void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'issues'] });
}

/**
 * Post a top-level comment on an issue's conversation.
 *
 * Invalidates the conversation only — a discussion comment carries no state
 * change, so the row's status pill is the same as it was.
 */
export function useCommentIssue(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.issueComment({ repoId, number, ...input });
    },
    onSuccess: (result) => {
      if (!result.ok || !repoId || number === null) return;
      void client.invalidateQueries({ queryKey: forgeKeys.forgeIssueComments(repoId, number) });
    },
  });
}

export function useSetIssueState(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { state: 'open' | 'closed' }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.issueSetState({ repoId, number, ...input });
    },
    onSuccess: (result) => {
      if (result.ok) invalidateIssueState(client, repoId, number);
    },
  });
}

/**
 * Create an issue (`IssueDialog`'s create mode). Invalidates every listing
 * key for this repo — `forgeKeys.forgeIssues` is keyed by limit AND state, and the
 * sidebar section, dashboard widget and Issues view each ask with different
 * values, the same prefix match `invalidateIssueState` above already uses.
 */
export function useCreateIssue(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: string;
    }): Promise<ForgeIssueCreateResult> => {
      const api = bridge();
      if (!api || !repoId) return NO_FORGE_ISSUE_CREATE;
      return api.forge.issueCreate({ repoId, ...input });
    },
    onSuccess: (result) => {
      if (result.ok && repoId) {
        void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'issues'] });
      }
    },
  });
}

export function useEditIssue(repoId: string | null, number: number | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title?: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: string | null;
    }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId || number === null) return NO_FORGE_WRITE;
      return api.forge.issueEdit({ repoId, number, ...input });
    },
    onSuccess: (result) => {
      if (result.ok && repoId && number !== null) invalidateIssueState(client, repoId, number);
    },
  });
}

/**
 * Delete an issue outright — the caller (`IssueDialog`) is the one that
 * raised the blast-radius confirm; this mutation only ever runs once a human
 * has already agreed to it.
 */
export function useDeleteIssue(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { number: number }): Promise<ForgeWriteResult> => {
      const api = bridge();
      if (!api || !repoId) return NO_FORGE_WRITE;
      return api.forge.issueDelete({ repoId, number: input.number });
    },
    onSuccess: (result) => {
      if (result.ok && repoId) {
        void client.invalidateQueries({ queryKey: ['repos', repoId, 'forge', 'issues'] });
      }
    },
  });
}

export function useCreateProject(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { title: string }): Promise<ForgeProjectCreateResult> => {
      const api = bridge();
      if (!api || !repoId) return NO_FORGE_PROJECT_CREATE;
      return api.forgeProject.create({ repoId, ...input });
    },
    onSuccess: (result) => {
      if (result.ok && repoId) {
        void client.invalidateQueries({ queryKey: forgeKeys.forgeProjects(repoId) });
      }
    },
  });
}

export function useEditProject(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      title?: string;
      closed?: boolean;
    }): Promise<ForgeProjectWriteResult> => {
      const api = bridge();
      if (!api) return NO_FORGE_PROJECT_WRITE;
      return api.forgeProject.edit(input);
    },
    onSuccess: (result) => {
      if (result.ok && repoId) {
        void client.invalidateQueries({ queryKey: forgeKeys.forgeProjects(repoId) });
      }
    },
  });
}

/**
 * Delete a board outright. The caller (`ProjectDialog`) raised the
 * blast-radius confirm (item count) before this ever runs — GitHub's own
 * project deletion is irreversible.
 */
export function useDeleteProject(repoId: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string }): Promise<ForgeProjectWriteResult> => {
      const api = bridge();
      if (!api) return NO_FORGE_PROJECT_WRITE;
      return api.forgeProject.delete(input);
    },
    onSuccess: (result) => {
      if (result.ok && repoId) {
        void client.invalidateQueries({ queryKey: forgeKeys.forgeProjects(repoId) });
      }
    },
  });
}

/**
 * A `blockedBy`/`subIssue` dependency edge between two issues (Phase 95
 * Theme F's Confirm step) — `IssueDialog`/`ProjectDialog`'s siblings had no
 * reason to add this hook before Plan with AI's confirm sequencer needed it.
 * No repo-scoped cache key bound at the hook's lifetime, matching
 * `useAddProjectItem`'s own reasoning: the confirm sequencer calls this once
 * per edge across potentially several repos in one sitting (a cross-repo
 * `targetRepo`), so `repoId`/`number`/`targetNumber` all travel with each
 * `mutate()` call instead.
 */
export function useLinkIssues() {
  return useMutation({
    mutationFn: async (input: {
      repoId: string;
      kind: ForgeLinkKind;
      number: number;
      targetNumber: number;
      targetRepo?: string;
    }): Promise<ForgeLinkWriteResult> => {
      const api = bridge();
      if (!api) return { ok: false, cli: EMPTY_CLI, error: null };
      return api.forge.issuesLink(input);
    },
  });
}
