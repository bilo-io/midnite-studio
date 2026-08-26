import type {
  ForgePullsResult,
  ForgeRunsResult,
  Ref,
  Remote,
  RepoDescriptor,
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
  forgePulls: (repoId: string) => ['repos', repoId, 'forge', 'pulls'] as const,
  /** Whether `gh` is installed and signed in. Not repo-scoped — it is machine state. */
  forgeCli: ['forge', 'cli'] as const,
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

export function useForgePulls(repoId: string | null, enabled: boolean) {
  return useQuery<ForgePullsResult>({
    queryKey: keys.forgePulls(repoId ?? ''),
    queryFn: async () => {
      const api = bridge();
      if (!api || !repoId) return EMPTY_PULLS;
      return api.forge.pulls({ repoId, limit: 20 });
    },
    enabled: enabled && repoId !== null,
    staleTime: FORGE_STALE_MS,
  });
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
