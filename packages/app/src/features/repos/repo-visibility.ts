import { pickForgeRemote, type Forge, type ForgeAccount } from '@midnite/studio-shared';

import { bridge } from '../../services/bridge';

/**
 * A leaf module, deliberately: `isRepoVisibleForAccount` and
 * `countHiddenReposForAccount` below are the one piece of Phase 90 Theme C's
 * account-scoping logic that `services/queries.ts` also needs (for the
 * account-switch toast, in `useSwitchForgeAccount`) — and `queries.ts` is
 * what `forge-account-scope.ts` itself imports `keys` from. Anything this
 * file needed back from either of those would make it a cycle; it imports
 * only `bridge` and shared domain types, so it can sit underneath both.
 * `forge-account-scope.ts` re-exports {@link isRepoVisibleForAccount} and
 * {@link ReachableSlug} for its own existing importers.
 */

/** The one field of {@link ForgeAccount} this file reads for a reachable
 *  entry — narrower than the full `ReachableRepo` so a caller that has no
 *  live listing (or a provider `useReachableRepos` reports `unsupported`
 *  for) can pass `null` rather than an empty array with a different meaning. */
export type ReachableSlug = { owner: string; name: string };

/**
 * Whether a repo whose primary remote resolved to `forge` should be visible
 * under `active` — the "hidden, not closed" half of Phase 90 Theme C.
 * `repo-registry.ts` keeps every repo open regardless of this answer; only
 * `repos-panel.tsx`'s render list (via `forge-account-scope.ts`) and the
 * account-switch toast (via `countHiddenReposForAccount` below) read it.
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
 * Imperative twin of `useAccountScopedRepos`'s own hidden-count math
 * (`forge-account-scope.ts`) — for the one-off answer the account-switch
 * toast needs right after a switch succeeds (`useSwitchForgeAccount`),
 * outside render and with no continuously-reactive count to keep current.
 * Goes straight to the bridge for every input — open repos, each one's
 * remotes, the new account's reachable slugs — rather than the query cache,
 * so the number is right even when nothing that would have warmed that
 * cache is mounted (a switch fired from the palette or Settings, where no
 * `ReposPanel` is necessarily open). Never throws: any bridge failure reads
 * as "nothing hidden" rather than losing the toast a switch that already
 * succeeded earned.
 */
export async function countHiddenReposForAccount(account: ForgeAccount): Promise<number> {
  const api = bridge();
  if (!api) return 0;

  try {
    const repos = (await api.repos.list()) ?? [];
    if (repos.length === 0) return 0;

    // Same "no adapter yet" boundary `useAccountScopedRepos` draws — `null`
    // reads as "no evidence either way", which `isRepoVisibleForAccount`
    // already treats as "stay visible" rather than a reason to hide.
    const reachable =
      account.kind === 'github'
        ? await (async () => {
            const result = await api.forgeAccounts.reachableRepos({ accountId: account.id });
            return result.ok ? result.repos : null;
          })()
        : null;

    const visible = await Promise.all(
      repos.map(async (repo) => {
        const remotes = (await api.remotes.list({ repoId: repo.id })) ?? [];
        const forge = pickForgeRemote(remotes)?.forge ?? null;
        return isRepoVisibleForAccount(forge, account, reachable);
      }),
    );
    return visible.filter((isVisible) => !isVisible).length;
  } catch {
    return 0;
  }
}
