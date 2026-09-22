import type { Forge, ForgeAccount } from '@midnite/studio-shared';

import type { ForgeAdapter } from './adapter';
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
 * Returns `null` for a forge kind with no adapter yet — GitLab, Bitbucket and
 * Azure DevOps until Themes E, F and G land — so a repository on one of those
 * hosts reports "no forge" honestly instead of a GitHub adapter running `gh`
 * against the wrong owner/repo, which is what happened before this theme
 * (Theme A widened `isSupportedForgeKind` to all four ahead of any adapter
 * existing to serve them).
 */
export function adapterFor(forge: Forge, _account: ForgeAccount | null): ForgeAdapter | null {
  const exhaustive: Record<Forge['kind'], ForgeAdapter | null> = {
    github: createGitHubAdapter(),
    gitlab: null,
    bitbucket: null,
    azure: null,
    unknown: null,
  };
  return exhaustive[forge.kind];
}
