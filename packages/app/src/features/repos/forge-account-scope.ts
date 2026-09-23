import { useQueries } from '@tanstack/react-query';
import { pickForgeRemote, type ForgeAccount, type Remote } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';
import { isRepoVisibleForAccount, type ReachableSlug } from './repo-visibility';

import type { RepoDescriptor } from '@midnite/studio-shared';

// Re-exported for this file's own existing importers (`forge-account-scope.test.ts`) —
// see `repo-visibility.ts`'s own header for why the definitions live there now.
export { isRepoVisibleForAccount, type ReachableSlug };

/**
 * `repos-panel.tsx`'s account-scoping filter. Fans a `remotes.list` query out
 * over every open repo — not just the ones currently expanded, which is all
 * `useRemotes` fetches on its own (`repos-panel.tsx:673`) — because a
 * collapsed repo still has to answer "does this belong to the active
 * account" for the top-level list. Every query shares its cache key with
 * `useRemotes`, so expanding a repo pays nothing twice.
 */
export function useAccountScopedRepos(
  repos: readonly RepoDescriptor[],
  options: {
    /**
     * Evaluate every repo against the active account even while the scoping
     * setting is off, so `outOfScopeCount` still answers "how many WOULD be
     * hidden". The account switcher's menu (Phase 90 Theme L) passes it:
     * its hidden-repos toggle has to stay reachable after it is switched
     * off, or the menu could turn scoping off but never back on.
     */
    evaluateWhenOff?: boolean;
  } = {},
): {
  visible: readonly RepoDescriptor[];
  hiddenCount: number;
  /** Repos that don't belong to the active account, whether or not the
   *  setting is hiding them — equal to `hiddenCount` while it is on. `0`
   *  when scoping is off and `evaluateWhenOff` was not asked for. */
  outOfScopeCount: number;
} {
  const scoping = useUiStore((s) => s.forgeScopeReposToActiveAccount);
  const accounts = useUiStore((s) => s.forgeAccounts);
  const activeId = useUiStore((s) => s.forgeActiveAccountId);
  const active = accounts.find((a) => a.id === activeId) ?? null;
  const evaluate = scoping || options.evaluateWhenOff === true;

  const remoteQueries = useQueries({
    queries: repos.map((repo) => ({
      queryKey: keys.remotes(repo.id),
      queryFn: async () => (await bridge()?.remotes.list({ repoId: repo.id })) ?? [],
      enabled: evaluate && active !== null,
      staleTime: 60_000,
    })),
  });

  // GitHub is the one kind with a working reachable-repos listing today
  // (Themes E-G own the rest) — see `reachable-repos.ts`. `null` for every
  // other kind means "no evidence either way", which `isRepoVisibleForAccount`
  // already treats as "stay visible".
  const reachable = useReachableSlugsForScope(evaluate && active?.kind === 'github' ? active : null);

  if (!evaluate || !active) return { visible: repos, hiddenCount: 0, outOfScopeCount: 0 };

  const inScope = repos.filter((repo, index) => {
    const remotes = (remoteQueries[index]?.data ?? []) as Remote[];
    const forge = pickForgeRemote(remotes)?.forge ?? null;
    return isRepoVisibleForAccount(forge, active, reachable);
  });
  const outOfScopeCount = repos.length - inScope.length;

  return scoping
    ? { visible: inScope, hiddenCount: outOfScopeCount, outOfScopeCount }
    : { visible: repos, hiddenCount: 0, outOfScopeCount };
}

/**
 * The active GitHub account's reachable slugs — the same cache entry
 * `useReachableRepos` (`services/queries.ts`) reads, so opening Settings ▸
 * Accounts once and this filter running both land on one fetch, not two.
 * `null` while unresolved (or for a kind with no listing yet), which
 * `isRepoVisibleForAccount` already treats as "stay visible" rather than as
 * a reason to hide.
 */
function useReachableSlugsForScope(account: ForgeAccount | null): ReachableSlug[] | null {
  const [result] = useQueries({
    queries: [
      {
        queryKey: keys.forgeAccountReachableRepos(account?.id ?? ''),
        queryFn: async () =>
          (await bridge()?.forgeAccounts.reachableRepos({ accountId: account?.id ?? '' })) ?? {
            ok: false as const,
            reason: 'no-account' as const,
          },
        enabled: account !== null,
        staleTime: 60_000,
      },
    ],
  });
  const data = result?.data;
  return data && data.ok ? data.repos : null;
}
