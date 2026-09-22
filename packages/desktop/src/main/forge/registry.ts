import type { Forge, ForgeAccount } from '@midnite/studio-shared';

import type { ForgeAdapter } from './adapter';
import { createBitbucketAdapter } from './bitbucket/create-bitbucket-adapter';
import { createGitHubAdapter } from './github/create-github-adapter';

/**
 * The single dispatch point `forge-handlers.ts`'s handlers call instead of
 * importing `gh-*.ts` directly (Phase 90 Theme D).
 *
 * `account` is accepted now, ahead of any caller actually needing it, because
 * the interface this dispatches on is meant to outlive Theme D: an
 * HTTP-backed adapter (Themes E-G) is bound to one account's token, where
 * GitHub is bound to nothing — `gh` itself is the credential, exactly as it
 * was before this refactor. Passing `null` for `account` on every call site
 * this theme touches is therefore not a stub; it is the correct value until
 * Theme C starts resolving one.
 *
 * Returns `null` for a forge kind with no adapter yet — GitLab and Azure
 * DevOps until Themes E and G land — so a repository on one of those hosts
 * reports "no forge" honestly instead of a GitHub adapter running `gh`
 * against the wrong owner/repo, which is what happened before Theme D
 * (Theme A widened `isSupportedForgeKind` to all four ahead of any adapter
 * existing to serve them). Bitbucket (Theme F) is the first of the three to
 * land, and the first consumer that actually reads `account` — bound once
 * here rather than threaded through every one of its calls.
 */
export function adapterFor(forge: Forge, account: ForgeAccount | null): ForgeAdapter | null {
  const exhaustive: Record<Forge['kind'], ForgeAdapter | null> = {
    github: createGitHubAdapter(),
    gitlab: null,
    bitbucket: createBitbucketAdapter(account),
    azure: null,
    unknown: null,
  };
  return exhaustive[forge.kind];
}
