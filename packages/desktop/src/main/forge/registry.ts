import type { Forge, ForgeAccount } from '@midnite/studio-shared';

import type { ForgeAdapter } from './adapter';
import { createBitbucketAdapter } from './bitbucket/create-bitbucket-adapter';
import { createGitHubAdapter } from './github/create-github-adapter';
import { createGitLabAdapter } from './gitlab/create-gitlab-adapter';

/**
 * The single dispatch point `forge-handlers.ts`'s handlers call instead of
 * importing `gh-*.ts` directly (Phase 90 Theme D).
 *
 * `account` is accepted now, ahead of any caller actually needing it, because
 * the interface this dispatches on is meant to outlive Theme D: an
 * HTTP-backed adapter (Themes E-G) is bound to one account's token, where
 * GitHub is bound to nothing — `gh` itself is the credential, exactly as it
 * was before this refactor. Bitbucket (Theme F) and GitLab (Theme E) are the
 * first two consumers that actually read `account` — bound once here, then
 * threaded through every one of their own calls rather than resolved eagerly:
 * both adapters resolve the account's vaulted token lazily, per call
 * (`bitbucket-client.ts`'s `resolveCredential`, `gitlab-client.ts`'s
 * `resolveToken`), so `adapterFor` itself stays synchronous — it is a
 * closure, not a lookup.
 *
 * Returns `null` for a forge kind with no adapter yet — Azure DevOps until
 * Theme G lands — so a repository on that host reports "no forge" honestly
 * instead of a GitHub adapter running `gh` against the wrong owner/repo,
 * which is what happened before Theme D (Theme A widened
 * `isSupportedForgeKind` to all four ahead of any adapter existing to serve
 * them). A GitLab or Bitbucket repo with no account, or one whose token
 * failed to load, resolves to `null` from *within* that adapter's own calls
 * (each read/write reports `cli.reason: 'not-authenticated'`) rather than
 * from this dispatch point — `resolveAdapter`'s caller in `forge-handlers.ts`
 * only ever sees "no adapter" for a kind with none built yet.
 */
export function adapterFor(forge: Forge, account: ForgeAccount | null): ForgeAdapter | null {
  const exhaustive: Record<Forge['kind'], ForgeAdapter | null> = {
    github: createGitHubAdapter(),
    gitlab: createGitLabAdapter(account),
    bitbucket: createBitbucketAdapter(account),
    azure: null,
    unknown: null,
  };
  return exhaustive[forge.kind];
}
