import type { Ref, RepoDescriptor, Worktree } from '@midnite/git-shared';
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
   * A commit's diff. Under the repo (so it is dropped when the repo closes) but
   * NOT under `status` — a commit is immutable, so a working-tree event has
   * nothing to say about it.
   */
  commitDiff: (repoId: string, sha: string, path: string, context: number) =>
    ['repos', repoId, 'commit-diff', sha, path, context] as const,
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
