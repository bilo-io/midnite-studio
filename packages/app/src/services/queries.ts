import { knowledgeKeys } from '@midnite/studio-frame';

import type {
  AiPlanBlueprint,
  AppIssueSubmitRequest,
  AppIssueSubmitResult,
  ClosedSession,
  DiagnosticsCandidate,
  DiagnosticsCommand,
  DiagnosticsRun,
  DiagnosticsTrustStatus,
  ForgeAccount,
  ForgeKind,
  ReachableReposResult,
  RepoSkill,
  GitOpResult,
  Ref,
  ReflogEntry,
  Remote,
  RepoDescriptor,
  RepoStats,
  StashEntry,
  StatsWindow,
  Worktree,
} from '@midnite/studio-shared';
import { pickForgeRemote } from '@midnite/studio-shared';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { useToasts } from '../components/toast-host';
import { countHiddenReposForAccount } from '../features/repos/repo-visibility';
import { useUiStore } from '../store/ui-store';
import { bridge } from './bridge';
import { dbSchemaKey } from '@midnite/studio-feature-database/renderer';
import { testsKeys } from '@midnite/studio-feature-tests/renderer';

// The Tests view's hooks live in the tests feature (Phase 113 Theme O);
// re-exported so the rest of the app imports them from here as before.
export {
  useTestDiscovery,
  useRefreshTestDiscovery,
  useTestTrustStatus,
  useTrustTestSuite,
  useUntrustTestSuite,
  useRunTestSuite,
  useCancelTestRun,
} from '@midnite/studio-feature-tests/renderer';
import {
  EMPTY_CLI,
  FORGE_STALE_MS,
  forgeKeys,
  useForgeCapabilities,
} from '@midnite/studio-feature-forge/renderer';

// The issue and board hooks live in the forge feature too (Phase 113 Theme O) — Studio and Coder
// both hand them to the Tasks feature's host port; re-exported so the rest of the app imports them
// from here as before.
export {
  useClearProjectItemField,
  useCommentIssue,
  useCreateIssue,
  useCreateProject,
  useDeleteIssue,
  useDeleteProject,
  useEditIssue,
  useEditProject,
  useForgeIssueComments,
  useForgeIssueDetail,
  useForgeIssues,
  useForgeProjectFields,
  useForgeProjectItems,
  useLinkIssues,
  useSetIssueState,
  useSetProjectItemField,
  type ForgeProjectItemsPage,
} from '@midnite/studio-feature-forge/renderer';

// The forge hooks Reviews and Actions read live in the forge feature (Phase 113 Theme O);
// re-exported so the rest of the app imports them from here as before.
export {
  invalidateForgeKind,
  useForgeCapabilities,
  useForgeRuns,
  useForgeProjects,
  useAddProjectItem,
  useForgeRunDetail,
  useForgeRunLog,
  useForgeWorkflows,
  useForgePulls,
  useForgePullDetail,
  useForgePullFiles,
  useForgePullComments,
  useForgePullThreads,
  useAddReviewComment,
  useReplyToReviewComment,
  useSetThreadResolved,
  useReviewPull,
  useCommentPull,
  useMergePull,
  useRequestReview,
  useMarkPullReady,
  useRerunChecks,
  useRefreshForge,
} from '@midnite/studio-feature-forge/renderer';

/**
 * Where an fs browse/write request is rooted — a repository checkout, or
 * `~/.claude` for the Agent settings page. Moved here (out of
 * `features/files/fs-scope-key.ts`) so `keys.fs` can live beside the rest of
 * the query keys rather than a scope-key builder living apart from them.
 */
export type FsScopeInput =
  | { scope: 'repo'; repoId: string; worktreePath?: string }
  | { scope: 'claude-home' };

/**
 * TanStack Query keys, in one place.
 *
 * Every key is a prefix-able tuple so the watcher (Phase 10) can invalidate a
 * whole repo's data with one call rather than enumerating query names —
 * `invalidateQueries({ queryKey: keys.repo(id) })` catches refs, worktrees and
 * status together.
 */
export const keys = {
  ...forgeKeys,
  ...testsKeys,
  repos: ['repos'] as const,
  repo: (repoId: string) => ['repos', repoId] as const,
  refs: (repoId: string) => ['repos', repoId, 'refs'] as const,
  worktrees: (repoId: string) => ['repos', repoId, 'worktrees'] as const,
  /**
   * A repo's stash list (Phase 22 Theme B).
   *
   * Under the `repos/<id>` prefix like `refs`/`worktrees` — `queries.ts`'s own
   * standing rule, reiterated in the phase doc, is that a key outside that
   * prefix is never invalidated by the watcher. `.git/refs/stash` already
   * falls under the recursive `.git/refs` watch and classifies as `'refs'`,
   * so a `stash push`/`pop`/`drop` invalidates this for free the same way a
   * branch write invalidates `refs`.
   */
  stashes: (repoId: string) => ['repos', repoId, 'stashes'] as const,
  /**
   * A repo's reflog for one ref (Phase 22 Theme G), keyed by `ref` so
   * switching the History view's ref selector doesn't share a cache entry
   * across branches. Under the `repos/<id>` prefix like `stashes` — `.git/logs`
   * rides the `'refs'` `WatchKind` (`repo-watcher.ts`), so any write that
   * touches a ref refreshes this the same way it already refreshes `refs`.
   */
  reflog: (repoId: string, ref: string) => ['repos', repoId, 'reflog', ref] as const,
  /**
   * A stash entry's three-part file list (Phase 22 Theme D). Under the repo
   * prefix and invalidated on the same `'refs'` event as `stashes` above — a
   * selector is index-based (`stash@{n}`) and can point at a different
   * underlying entry after another push/pop/drop, so a stale cache here would
   * show the wrong stash's files rather than none at all.
   */
  stashDetail: (repoId: string, selector: string) =>
    ['repos', repoId, 'stash', selector] as const,
  /** One file's diff within one part of a stash entry (Phase 22 Theme D). */
  stashDiff: (repoId: string, selector: string, part: string, path: string, context: number) =>
    [...keys.stashDetail(repoId, selector), part, path, context] as const,
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
  hookStatus: (repoId: string) => ['repos', repoId, 'hook-status'] as const,
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
   * A conflicted path's parsed regions (Phase 47 Theme D). Under `status` for
   * the same reason `diff` is: the watcher invalidates that prefix on every
   * worktree/index event, which is exactly what `applyConflictHunk` writing
   * the file — or another tool resolving it outside the app — produces, and
   * is how the Studio ever sees a region it accepted disappear.
   */
  conflictRegions: (repoId: string, worktreePath: string | undefined, path: string) =>
    [...keys.status(repoId, worktreePath), 'conflict-regions', path] as const,
  /**
   * Whether a blob is already in the local object database, at one revision
   * and path — the gate on a pull request's "Fetch to compare" affordance
   * (Phase 26 Theme H). NOT under `status`: a working-tree edit says nothing
   * about whether some OTHER commit's blob is present, so the watcher's
   * blanket `status` invalidation would only cause needless re-checks. The
   * one thing that changes the answer is a successful `fetch`, which the
   * caller invalidates this key for explicitly.
   */
  blobExists: (repoId: string, worktreePath: string | undefined, rev: string, path: string) =>
    ['repos', repoId, 'blob-exists', worktreePath ?? '-', rev, path] as const,
  /** The open checkout's own agent skills — read off disk, not the forge. */
  repoSkills: (repoId: string, agentId: string) => ['repos', repoId, 'skills', agentId] as const,
  /**
   * One page of the git graph's CI column — the runs for a batch of visible
   * commits. Keyed by the page's shas, which are stable across a restream, so
   * scrolling back to a page is a cache hit; under the forge prefix so the
   * forge Refresh drops it with everything else.
   */
  commitStats: (repoId: string, shas: readonly string[]) => ['commit-stats', repoId, shas] as const,
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
  /**
   * A repo's whole fs cache, across every worktree — coarser than {@link
   * keys.fs}, which pins one worktree. The watcher only ever learns a
   * `repoId`, never which worktree changed, so a `worktree` event invalidates
   * this prefix rather than guessing a worktreePath.
   */
  fsRepo: (repoId: string) => ['fs', 'repo', repoId] as const,
  /**
   * The repo's tracked and untracked file paths via `git ls-files` (Phase 23 Theme G).
   * Cached per repo and tip SHA so commit / checkout auto-invalidates.
   */
  repoFiles: (repoId: string, tipSha?: string | null, worktreePath?: string) =>
    ['repos', repoId, 'files-index', worktreePath ?? 'main', tipSha ?? 'HEAD'] as const,
  /**
   * The fs browse/write scope prefix (Phase 16 reads, Phase 24 writes) — also
   * what a manual refresh invalidates. Outside the `repos` prefix on purpose:
   * `claude-home` scope has no `repoId` to nest under, and a repo close should
   * not drop the Agent settings page's own tree cache.
   */
  fs: (scope: FsScopeInput) =>
    scope.scope === 'repo'
      ? ([...keys.fsRepo(scope.repoId), scope.worktreePath ?? null] as const)
      : (['fs', 'claude-home'] as const),
  /**
   * A connection's introspected schema tree (Phase 61 Theme F). Outside the
   * `repos` prefix on purpose — a database connection is not repo-scoped, so
   * there is no repo close to drop it on.
   */
  // The Database feature's own key (Phase 113 Theme O) — the companion's cache peek reads the same entry.
  dbSchema: dbSchemaKey,
  /**
   * The sessions you closed (Phase 67 Theme C). Outside the `repos` prefix on
   * purpose — history spans every repo in one list (Theme E's `global: true`),
   * so there is no repo close to drop it on; a manual refresh is the header's
   * own affordance instead (`useRefreshSessionHistory`), the same relationship
   * `forgeCli` has with `useRefreshForge`.
   */
  sessionsHistory: ['sessions', 'history'] as const,
  // Moved to the frame with the Knowledge view (Phase 113 Theme M); spread so every call site is unchanged.
  ...knowledgeKeys,
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

/** The repo's favicon/logo data URL, or null. Cached for the session: the finder is deterministic. */
export function useRepoLogo(repoId: string | undefined) {
  return useQuery<string | null>({
    queryKey: ['repo-logo', repoId] as const,
    queryFn: async () => (await bridge()?.repos.logo({ repoId: repoId as string }))?.dataUrl ?? null,
    enabled: !!repoId,
    staleTime: 5 * 60_000,
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
/** A repo's stash list (Phase 22 Theme B), nested under `keys.repo`. */
export function useStashes(repoId: string | null, worktreePath?: string) {
  return useQuery<StashEntry[]>({
    queryKey: keys.stashes(repoId ?? ''),
    queryFn: async () =>
      repoId ? ((await bridge()?.stash.list({ repoId, worktreePath })) ?? []) : [],
    enabled: repoId !== null,
  });
}

/**
 * One stash entry's three-part file list (Phase 22 Theme D).
 *
 * `data === null` is a real answer, not a loading state: the selector is
 * index-based and can go stale between the sidebar rendering it and the
 * inspector reading it (another push/pop/drop shifts every later index), so
 * "no such stash" is a state the panel has to render, not an error.
 */
export function useStashDetail(repoId: string | null, selector: string | null) {
  return useQuery({
    queryKey: keys.stashDetail(repoId ?? '', selector ?? ''),
    queryFn: async () =>
      repoId && selector ? ((await bridge()?.stash.detail({ repoId, selector })) ?? null) : null,
    enabled: repoId !== null && selector !== null,
  });
}

/** A repo's reflog for one ref (Phase 22 Theme G) — `ref` absent means HEAD. */
export function useReflog(repoId: string | null, ref?: string, worktreePath?: string) {
  return useQuery<ReflogEntry[]>({
    queryKey: keys.reflog(repoId ?? '', ref ?? 'HEAD'),
    queryFn: async () => (repoId ? ((await bridge()?.reflog.list({ repoId, ref, worktreePath })) ?? []) : []),
    enabled: repoId !== null,
  });
}

export function useRemotes(repoId: string | null) {
  return useQuery<Remote[]>({
    queryKey: keys.remotes(repoId ?? ''),
    queryFn: async () => (repoId ? ((await bridge()?.remotes.list({ repoId })) ?? []) : []),
    enabled: repoId !== null,
  });
}

/**
 * Whether Theme E's `prepare-commit-msg` stamp hook is installed for a repo —
 * read straight off disk on every call (main's own `hookStatus`), never
 * cached across the toggle: the switch must reflect what is really on the
 * user's filesystem, not the app's memory of last setting it.
 */
export function useHookStatus(repoId: string | null) {
  return useQuery<boolean>({
    queryKey: keys.hookStatus(repoId ?? ''),
    queryFn: async () => {
      if (!repoId) return false;
      const result = await bridge()?.hooks.status({ repoId });
      return result?.ok === true ? result.value.installed : false;
    },
    enabled: repoId !== null,
  });
}

/**
 * Install or remove Theme E's hook for one repo, then refetch that repo's
 * status — an optimistic flip would show "on" through the moment `install`
 * itself refuses because a pre-existing hook is in the way.
 */
export function useSetHookInstalled(): (repoId: string, installed: boolean) => Promise<GitOpResult> {
  const client = useQueryClient();
  return async (repoId, installed) => {
    const api = bridge();
    if (!api) return { ok: false, kind: 'error', message: 'No bridge available.' };
    const result = installed
      ? await api.hooks.install({ repoId })
      : await api.hooks.uninstall({ repoId });
    await client.invalidateQueries({ queryKey: keys.hookStatus(repoId) });
    return result;
  };
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

/**
 * Clone one of the active account's reachable repos (Theme C) — the picker
 * asks for a destination FOLDER via the same native dialog `pickAndOpen`
 * uses (its "Open Repository" wording is a minor mismatch here, not worth a
 * second dialog contract), then clones `name` into it. Resolves to null when
 * the user cancels the destination picker, same contract as `pickAndOpen`.
 */
export function useCloneReachableRepo() {
  const client = useQueryClient();
  const clone = useMutation({
    mutationFn: async (input: { destDir: string; url: string; name: string }) => {
      const api = bridge();
      if (!api) return { ok: false as const, message: 'Desktop bridge unavailable.' };
      return api.repos.clone(input);
    },
    onSuccess: (result) => {
      if (result.ok) void client.invalidateQueries({ queryKey: keys.repos });
    },
  });
  return {
    ...clone,
    /** Resolves to null when the user cancels the destination picker. */
    pickAndClone: async (url: string, name: string) => {
      const destDir = await bridge()?.repos.pickDirectory();
      if (!destDir) return null;
      return clone.mutateAsync({ destDir, url, name });
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
 * Every stored account (Phase 90 Theme B). Mirrored into `ui-store.ts`'s
 * `forgeAccounts`/`forgeActiveAccountId` on every successful fetch, so the
 * title-bar avatar can render from the store on first paint rather than
 * waiting on this query's own first resolution.
 */
export function useForgeAccounts() {
  const setForgeAccounts = useUiStore((s) => s.setForgeAccounts);
  return useQuery<ForgeAccount[]>({
    queryKey: keys.forgeAccounts,
    queryFn: async () => {
      const accounts = (await bridge()?.forgeAccounts.list({})) ?? [];
      setForgeAccounts(accounts);
      return accounts;
    },
  });
}

/** Validates the token against the provider's `whoami`, then stores it — a
 *  rejected token surfaces as `{ok: false, error}`, not a thrown mutation. */
export function useAddForgeAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: ForgeKind; host: string; token?: string }) => {
      const api = bridge();
      if (!api) return { ok: false as const, error: 'Desktop bridge unavailable.' };
      return api.forgeAccounts.add(input);
    },
    onSuccess: (result) => {
      if (result.ok) void client.invalidateQueries({ queryKey: keys.forgeAccounts });
    },
  });
}

export function useRemoveForgeAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await bridge()?.forgeAccounts.remove({ id })) ?? { ok: false },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.forgeAccounts }),
  });
}

/**
 * Every forge-data query key — the `'forge'`/`'forge-project'` segment
 * both the repo-scoped (`['repos', repoId, 'forge', …]`) and the
 * board-scoped (`['forge-project', projectId, …]`) families share, wherever
 * it falls in the tuple. `useSwitchForgeAccount` is the one caller: it needs
 * "every query whose data could differ by active account", not one prefix.
 */
const isForgeDataQuery = (queryKey: readonly unknown[]): boolean =>
  queryKey.includes('forge') || queryKey.includes('forge-project');

/**
 * Moves the active-account pointer. Theme B's whole scope for "switching" —
 * see `forgeAccounts.switch`'s own bridge docblock for what Theme C adds on
 * top of this same call, and the Decisions section on
 * `forge.scopeReposToActiveAccount` (`.midnite/tasks/phases/phase-90-…md`)
 * for the toast below, which Theme L shipped the switch without.
 *
 * The toast logic lives in this HOOK-LEVEL `onSuccess` rather than in a
 * per-call `mutate(id, { onSuccess })` at each of the three call sites
 * (`account-switcher.tsx`, `accounts-page.tsx`, `palette.tsx`) — and that is
 * not a style choice. `AccountSwitcherMenu`'s row click closes the menu
 * (`onSelect(); onClose();`, `context-menu.tsx`) in the same tick, which
 * unmounts the component that called `.mutate()` before this mutation's
 * promise ever settles. TanStack Query's per-call callbacks are gated on the
 * observer still having a listener (`MutationObserver#notify`'s
 * `this.hasListeners()` check) — a hook-level `onSuccess`, baked into the
 * `Mutation` itself at `.mutate()` time, is not, and fires regardless of
 * which component (if any) is still mounted to hear it.
 */
export function useSwitchForgeAccount() {
  const client = useQueryClient();
  const setForgeActiveAccountId = useUiStore((s) => s.setForgeActiveAccountId);
  const toasts = useToasts();
  // Set true immediately before an Undo action re-invokes `mutation.mutate`
  // below, and read (then cleared) by `onMutate` — the one signal that
  // reaches hook-level `onSuccess` reliably regardless of which component is
  // still mounted, which is what keeps an undone switch from re-toasting.
  const silentRef = useRef(false);

  const mutation = useMutation({
    mutationFn: async (id: string | null) =>
      (await bridge()?.forgeAccounts.switch({ id })) ?? { ok: false, activeAccountId: null },
    onMutate: () => {
      const silent = silentRef.current;
      silentRef.current = false;
      return { previousId: useUiStore.getState().forgeActiveAccountId, silent };
    },
    onSuccess: async (result, _id, mutateContext) => {
      if (result.ok) {
        setForgeActiveAccountId(result.activeAccountId);
        /*
          Phase 90 Theme C: the cache-poisoning risk the phase doc names as
          the one this phase would most regret shipping without a test for.
          A pull/issue/run listing already in flight for the account being
          switched AWAY from can resolve AFTER this switch and write into
          the same cache slot the new account's re-fetch reads — plain
          `invalidateQueries` alone does not stop that, because it races the
          still-settling old fetch rather than pre-empting it.

          `cancelQueries` first, so every in-flight forge fetch is marked
          cancelled and TanStack Query discards its eventual result instead
          of writing it in (the documented behaviour a cancelled query's
          resolution is dropped, not applied) — THEN `invalidateQueries`
          marks every one of them stale so the account's own re-mounted
          sections re-fetch clean, under the new account.
        */
        await client.cancelQueries({ predicate: (query) => isForgeDataQuery(query.queryKey) });
        await client.invalidateQueries({ predicate: (query) => isForgeDataQuery(query.queryKey) });

        if (!mutateContext?.silent && result.activeAccountId) {
          const account = useUiStore
            .getState()
            .forgeAccounts.find((a) => a.id === result.activeAccountId);
          if (account) {
            const hiddenCount = await countHiddenReposForAccount(account);
            if (hiddenCount > 0) {
              const noun = hiddenCount === 1 ? 'repository' : 'repositories';
              const previousId = mutateContext?.previousId ?? null;
              toasts.show({
                message: `Switched to ${account.login} (${account.kind}) · ${hiddenCount} ${noun} hidden`,
                action: {
                  label: 'Undo',
                  // Straight back through this same mutation, not a fresh
                  // one — Theme C's cancel/invalidate applies to the undo
                  // too. `silentRef` is what keeps this one un-toasted.
                  onAction: () => {
                    silentRef.current = true;
                    mutation.mutate(previousId);
                  },
                },
              });
            }
          }
        }
      }
      void client.invalidateQueries({ queryKey: keys.forgeAccounts });
    },
  });

  return mutation;
}

/**
 * The active account's reachable-repos listing (Theme C) — the repo picker's
 * clone-or-open list. `enabled` only once an id is known: there is nothing
 * to ask main for with no active account.
 */
export function useReachableRepos(accountId: string | null) {
  return useQuery<ReachableReposResult>({
    queryKey: keys.forgeAccountReachableRepos(accountId ?? ''),
    queryFn: async () =>
      (await bridge()?.forgeAccounts.reachableRepos({ accountId: accountId ?? '' })) ?? {
        ok: false,
        reason: 'no-account',
      },
    enabled: accountId !== null,
    staleTime: FORGE_STALE_MS,
  });
}

/**
 * The active repo's forge kind and its capability matrix, composed from
 * `useRemotes` + `useForgeCapabilities` — the same two-query pairing
 * `app.tsx`'s `useForgeViewAvailability` already does inline for the nav
 * gate. Factored out here because Phase 90 Theme H's "here's the limit"
 * sentence needs it in two views (`TasksView`, `PrDetail`) instead of one,
 * and `app.tsx`'s own copy stays inline — it answers a different question
 * (a boolean per view) and isn't `capabilitiesFor`'s to touch.
 */
export function useActiveForgeCapability(repoId: string | null) {
  const remotes = useRemotes(repoId);
  const kind = pickForgeRemote(remotes.data ?? [])?.forge?.kind ?? null;
  const capabilities = useForgeCapabilities(kind ?? 'unknown');
  return { kind, capability: capabilities.data };
}

const NO_REPO_SKILLS: readonly RepoSkill[] = [];

/**
 * The open repo's own agent skills (`<.claude|.agents|.codex>/skills/<name>/SKILL.md`),
 * for the Projects card skill picker. `agentId` is the agent the card would
 * launch, whose own convention directory wins a name present in several.
 * A failed read answers an empty list — the picker falls back to its
 * built-in catalogue rather than surfacing an error for a suggestion list.
 */
export function useRepoSkills(repoId: string | null, agentId: string) {
  return useQuery<readonly RepoSkill[]>({
    queryKey: keys.repoSkills(repoId ?? '', agentId),
    queryFn: async () => {
      const api = bridge();
      if (!api?.scaffold?.listRepoSkills || !repoId) return NO_REPO_SKILLS;
      const result = await api.scaffold.listRepoSkills({ repoId, agentId });
      return result.ok ? result.value.skills : NO_REPO_SKILLS;
    },
    enabled: repoId !== null,
    staleTime: 60_000,
  });
}

/** One issue's conversation, fetched when it is opened and never for a list. */

/** One board's field definitions, for the table's columns. Fetched only once a board is picked. */

/** How many pages `useForgeProjectItems` walks before it stops and reports `truncated`. */

/**
 * File an issue on the app's own public tracker — Phase 93.
 *
 * Unlike every other write above, this one takes **no `repoId`**: it always
 * targets `bilo-io/midnite-apps` (see `gh-app-issue.ts`), independent of
 * whichever repo is open in the git client, or whether one is open at all. No
 * cache to invalidate either — there is no local listing of that board's
 * issues for a success here to affect.
 */
export function useSubmitAppIssue() {
  return useMutation({
    mutationFn: async (input: AppIssueSubmitRequest): Promise<AppIssueSubmitResult> => {
      const api = bridge();
      if (!api) return NO_APP_ISSUE_WRITE;
      return api.report.submitIssue(input);
    },
  });
}

/*
  ─── Phase 54 Theme G: the two issue writes ─────────────────────────────────

  Same envelope discipline as the pull-request writes above — `ForgeWriteResult`,
  never a rejection — and the same asymmetry in what a success invalidates.
  Comment changes only the conversation. Close/reopen changes `state`, which
  the list's rows *and* the detail pane's header both draw (the header reads
  the `issue` its caller passed in, sourced from the same list), so that one
  invalidates the list's own prefix too — exactly `invalidatePullState`'s
  reasoning above, one write earlier in this file.
*/

/** Close or reopen an issue. */

// --- issue and project CRUD, and the wand (Phase 95 Theme E) ----------------

/** A partial edit (`IssueDialog`'s edit mode) — every field optional, an
 *  absent one left unchanged, matching `ForgeIssueEditInput`'s own shape. */

/** Create a board (`ProjectDialog`'s create mode). */

/** Rename a board, or close/reopen it (`ProjectDialog`'s edit mode).
 *  `repoId` is only for invalidating the picker's own listing — the write
 *  itself addresses the board by `projectId`, like every other `forgeProject`
 *  write. */

/**
 * The wand — rewrite one field's text through the roster's cheapest headless
 * CLI (`main/ai/improve-field.ts`). Not tied to a repo/issue/project id: the
 * dialog hands over exactly the text worth sending, and the mutation carries
 * no cache to invalidate — a rewrite is a suggestion the dialog applies to
 * its own local draft, never a write to the forge.
 */
export function useImproveField() {
  return useMutation({
    mutationFn: async (input: {
      agentId?: string;
      repoPath?: string | null;
      repoName: string;
      fieldName: string;
      fieldValue: string;
      otherFields?: Record<string, string>;
    }): Promise<GitOpResult<{ text: string }>> => {
      const api = bridge();
      if (!api) return { ok: false, kind: 'error', message: '' };
      return api.ai.improveField(withHeadlessAiModel(input));
    },
  });
}

/**
 * "Write with AI" on the commit box — a Conventional Commits message from the
 * staged (else working-tree) diff, drafted in main by the provider's fastest
 * model. Read-only, so no cache to invalidate.
 */
export function useCommitMessageAi() {
  return useMutation({
    mutationFn: async (input: {
      repoId: string;
      worktreePath?: string;
      agentId?: string;
    }): Promise<GitOpResult<{ text: string; source: 'staged' | 'working' }>> => {
      const api = bridge();
      if (!api) return { ok: false, kind: 'error', message: '' };
      return api.ai.commitMessage(withHeadlessAiModel(input));
    },
  });
}

/**
 * Phase 96 Theme I — Settings ▸ Agent ▸ "Headless AI features use". Read at
 * call time rather than threaded through every wand/Plan caller, so one
 * setting reroutes both without touching a dialog.
 */
function withHeadlessAiModel<T extends object>(input: T): T & { ollamaModel?: string } {
  const model = useUiStore.getState().headlessAiOllamaModel;
  return model ? { ...input, ollamaModel: model } : input;
}

/**
 * Plan with AI (Phase 95 Theme F) — draft or revise a blueprint. No cache to
 * invalidate, the same reasoning `useImproveField` gives: nothing is written
 * to a forge here, only a sheet's own local draft.
 */
export function usePlanBlueprint() {
  return useMutation({
    mutationFn: async (input: {
      agentId?: string;
      repoPath?: string | null;
      repoName: string;
      prompt: string;
      existing?: AiPlanBlueprint;
      originIssue?: { number: number; title: string };
    }): Promise<GitOpResult<{ blueprint: AiPlanBlueprint }>> => {
      const api = bridge();
      if (!api) return { ok: false, kind: 'error', message: '' };
      return api.ai.planBlueprint(withHeadlessAiModel(input));
    },
  });
}

/** Same reasoning, for the `ForgeIssueCreateResult` shape. */
/** Same reasoning, for the `ForgeProjectCreateResult` shape. */
/** Same reasoning as `NO_FORGE_WRITE`, for `AppIssueSubmitResult`'s extra `url` field. */
const NO_APP_ISSUE_WRITE: AppIssueSubmitResult = { ok: false, cli: EMPTY_CLI, error: null, url: null };

// --- session history (Phase 67) ---------------------------------------------

/** Resting state for `useSessionHistory` with no bridge — jsdom, the e2e harness. */
const EMPTY_SESSION_HISTORY: ClosedSession[] = [];

/**
 * The sessions you closed — read-only apart from `purge`, since an ending is
 * recorded in main where it is observed, so there is nothing here for the
 * renderer to append (see `bridge.ts`'s own doc on the `sessions` group).
 *
 * No `enabled` gate and no `staleTime`: unlike a forge listing this touches no
 * subprocess and no rate limit, and history is genuinely global (Theme E's
 * `global: true`) rather than following the active repo the way `useForgeIssues`
 * does.
 */
export function useSessionHistory() {
  return useQuery<ClosedSession[]>({
    queryKey: keys.sessionsHistory,
    queryFn: async () => {
      const api = bridge();
      if (!api) return EMPTY_SESSION_HISTORY;
      const result = await api.sessions.history();
      return result.sessions;
    },
  });
}

/** Re-run the closed-session listing, on the user's say-so — the header's refresh button. */
export function useRefreshSessionHistory() {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.sessionsHistory });
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
  timeline: [],
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

/**
 * Tracked and untracked file paths via `git ls-files` (Phase 23 Theme G).
 * Indexed per repo and tip SHA so commit / checkout auto-invalidates.
 */
export function useRepoFiles(
  repoId: string | null,
  tipSha?: string | null,
  worktreePath?: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: repoId ? keys.repoFiles(repoId, tipSha, worktreePath) : ['repos', 'none', 'files-index'],
    queryFn: async () => {
      if (!repoId) return { files: [], truncated: false };
      const api = bridge();
      if (!api) return { files: [], truncated: false };
      const res = await api.fs.listFiles({ repoId, worktreePath });
      return res.ok ? { files: res.files, truncated: res.truncated } : { files: [], truncated: false };
    },
    enabled: Boolean(repoId && (options?.enabled ?? true)),
    staleTime: Infinity,
  });
}

