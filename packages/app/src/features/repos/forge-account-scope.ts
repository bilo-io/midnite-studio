import { useQueries } from '@tanstack/react-query';
import { pickForgeRemote, type Forge, type ForgeAccount, type Remote } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';
import { keys } from '../../services/queries';
import { useUiStore } from '../../store/ui-store';

import type { RepoDescriptor } from '@midnite/studio-shared';

/** The one field of {@link ForgeAccount} this file reads for a reachable
 *  entry — narrower than the full `ReachableRepo` so a caller that has no
 *  live listing (or a provider `useReachableRepos` reports `unsupported`
 *  for) can pass `null` rather than an empty array with a different meaning. */
export type ReachableSlug = { owner: string; name: string };

/**
 * Whether a repo whose primary remote resolved to `forge` should be visible
 * under `active` — the "hidden, not closed" half of Phase 90 Theme C.
 * `repo-registry.ts` keeps every repo open regardless of this answer; only
 * `repos-panel.tsx`'s render list reads it.
 *
 * Two positive signals hide a repo, straight off the phase doc: a host
 * mismatch (always decidable from `forge` alone) and an owner the active
 * account cannot reach (decidable only once `reachable` has resolved).
 * Everything else stays visible — no recognised forge remote, an owner that
 * IS the account's own login, or an owner `reachable` has not disproven yet
 * all read as "don't hide without evidence", which is the phase doc's own
 * worry about a default-on setting surprising someone with a false hide.
 */
export function isRepoVisibleForAccount(
  forge: Forge | null,
  active: ForgeAccount | null,
  reachable: readonly ReachableSlug[] | null,
): boolean {
  if (!active || !forge) return true;
  if (forge.host !== active.host) return false;
  if (forge.owner.toLowerCase() === active.login.toLowerCase()) return true;
  if (reachable === null) return true;
  return reachable.some(
    (r) =>
      r.owner.toLowerCase() === forge.owner.toLowerCase() &&
      r.name.toLowerCase() === forge.repo.toLowerCase(),
  );
}

/**
 * `repos-panel.tsx`'s account-scoping filter. Fans a `remotes.list` query out
 * over every open repo — not just the ones currently expanded, which is all
 * `useRemotes` fetches on its own (`repos-panel.tsx:673`) — because a
 * collapsed repo still has to answer "does this belong to the active
 * account" for the top-level list. Every query shares its cache key with
 * `useRemotes`, so expanding a repo pays nothing twice.
 */
export function useAccountScopedRepos(repos: readonly RepoDescriptor[]): {
  visible: readonly RepoDescriptor[];
  hiddenCount: number;
} {
  const scoping = useUiStore((s) => s.forgeScopeReposToActiveAccount);
  const accounts = useUiStore((s) => s.forgeAccounts);
  const activeId = useUiStore((s) => s.forgeActiveAccountId);
  const active = accounts.find((a) => a.id === activeId) ?? null;

  const remoteQueries = useQueries({
    queries: repos.map((repo) => ({
      queryKey: keys.remotes(repo.id),
      queryFn: async () => (await bridge()?.remotes.list({ repoId: repo.id })) ?? [],
      enabled: scoping && active !== null,
      staleTime: 60_000,
    })),
  });

  // GitHub is the one kind with a working reachable-repos listing today
  // (Themes E-G own the rest) — see `reachable-repos.ts`. `null` for every
  // other kind means "no evidence either way", which `isRepoVisibleForAccount`
  // already treats as "stay visible".
  const reachable = useReachableSlugsForScope(scoping && active?.kind === 'github' ? active : null);

  if (!scoping || !active) return { visible: repos, hiddenCount: 0 };

  const visible = repos.filter((repo, index) => {
    const remotes = (remoteQueries[index]?.data ?? []) as Remote[];
    const forge = pickForgeRemote(remotes)?.forge ?? null;
    return isRepoVisibleForAccount(forge, active, reachable);
  });

  return { visible, hiddenCount: repos.length - visible.length };
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
