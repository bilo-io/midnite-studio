import type { Forge } from '@midnite/studio-shared';
import { useEffect, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { create } from 'zustand';

import { pickForgeRemote } from '@midnite/studio-shared';

import { bridge } from './bridge';
import { keys, useRepos } from './queries';

/**
 * `host/owner/repo`, lower-cased — the one key every forge URL and every
 * registered repo's remote are normalised into before either is compared to
 * the other. Exported so the resolver and the sync hook can never drift on
 * how a key is built.
 */
export function forgeRegistryKey(host: string, owner: string, repo: string): string {
  return `${host}/${owner}/${repo}`.toLowerCase();
}

export type RepoForgeRegistryState = {
  /** `forgeRegistryKey(...)` → the repo it names. */
  byForgeKey: Record<string, string>;
  setEntries: (entries: ReadonlyArray<{ repoId: string; forge: Forge }>) => void;
};

/**
 * Which registered repo (if any) a forge URL belongs to.
 *
 * A link-click resolver runs synchronously, from places that are not
 * components — `terminal-links.ts` hands it a bare callback, and a command
 * handler builds a plain closure — so it cannot itself hold a React Query
 * subscription. This store is the synchronous side of that: `useSyncRepoForgeRegistry`
 * (mounted once, near the app root) keeps it in step with every registered
 * repo's remotes, and `resolveInAppRoute` reads it via `getState()`.
 *
 * Whole-map replacement rather than per-repo upserts: a repo can close, and
 * `setEntries` is always called with the *complete* current set, so a closed
 * repo's key falls out on the next sync instead of pointing at a repo that no
 * longer exists.
 */
export const useRepoForgeRegistry = create<RepoForgeRegistryState>((set) => ({
  byForgeKey: {},
  setEntries: (entries) =>
    set({
      byForgeKey: Object.fromEntries(
        entries.map(({ repoId, forge }) => [
          forgeRegistryKey(forge.host, forge.owner, forge.repo),
          repoId,
        ]),
      ),
    }),
}));

/** The repo id a forge URL's `host/owner/repo` names, or `null` if none is registered. */
export function lookupRepoIdByForge(host: string, owner: string, repo: string): string | null {
  return useRepoForgeRegistry.getState().byForgeKey[forgeRegistryKey(host, owner, repo)] ?? null;
}

/**
 * Keeps {@link useRepoForgeRegistry} in step with every registered repo's
 * forge remote.
 *
 * Mounted once, near the app root (`app.tsx`) — not per-view — so the
 * registry is populated before the first link is ever clicked, and stays
 * correct as repos are opened, closed or reordered. One `useQueries` fan-out
 * over every repo's remotes, the same pattern `useWorktreeStatuses` already
 * uses for per-worktree status: cheap, cached by React Query, and it needs no
 * new IPC channel — `remotes.list` is the same call `useRemotes` makes for a
 * single repo.
 */
export function useSyncRepoForgeRegistry(): void {
  const reposData = useRepos().data;
  const repoIds = useMemo(() => (reposData ?? []).map((repo) => repo.id), [reposData]);

  const results = useQueries({
    queries: repoIds.map((repoId) => ({
      queryKey: keys.remotes(repoId),
      queryFn: async () => (await bridge()?.remotes.list({ repoId })) ?? [],
      staleTime: 60_000,
    })),
  });

  const entries = repoIds.flatMap((repoId, i) => {
    const forge = pickForgeRemote(results[i]?.data ?? [])?.forge ?? null;
    return forge ? [{ repoId, forge }] : [];
  });

  // A single string dependency, built from the entries themselves, rather
  // than the `results`/`entries` arrays: both are fresh references every
  // render (React Query and `flatMap` both return a new array each time),
  // so depending on either would fire this effect every render regardless of
  // whether anything actually changed.
  const signature = entries
    .map(({ repoId, forge }) => `${repoId}=${forgeRegistryKey(forge.host, forge.owner, forge.repo)}`)
    .join('|');

  useEffect(() => {
    useRepoForgeRegistry.getState().setEntries(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` is `entries` reduced to a primitive; re-deriving `entries` here would defeat the point.
  }, [signature]);
}
