import { isSupportedForgeKind, pickForgeRemote, type Forge, type ForgeCliStatus, type Remote } from '@midnite/studio-shared';

import type { ForgeAdapter } from './adapter';
import { createCommitRunsService } from './commit-runs';
import { activeAccountFor } from './forge-accounts';
import { adapterFor } from './registry';

/**
 * Which forge a repository belongs to — the composer's port (Phase 113 Theme O).
 *
 * The forge identity is resolved in main, never sent by a renderer: the only
 * thing that crosses IPC is a `repoId`, and main turns it into an owner/repo
 * pair from the repository's own remotes. *How* it reads them is the
 * composer's business — Studio runs `git config` through git-engine over its
 * repo registry; Coder reads `.git/config` read-only over its own list
 * ({@link readGitConfigRemotes}). Both hand this module the remotes, and
 * {@link forgeFromRemotes} picks the forge the same way for both.
 */
export type RepoRemotesResolver = (repoId: string) => Promise<readonly Remote[] | null>;

let resolveRemotes: RepoRemotesResolver = async () => null;

/** Installed by `forgeMain.register` from the composer's `remotes` port. */
export function configureRepoRemotes(next: RepoRemotesResolver): void {
  resolveRemotes = next;
}

/** The supported forge among `remotes` (origin first), or null. */
export function forgeFromRemotes(remotes: readonly Remote[]): Forge | null {
  const forge = pickForgeRemote(remotes)?.forge ?? null;
  // A NAS path or Gerrit host is not a failure to report — it is a repository
  // this feature has nothing to say about until an adapter exists for its kind.
  return forge !== null && isSupportedForgeKind(forge.kind) ? forge : null;
}

export async function repoForge(repoId: string): Promise<Forge | null> {
  const remotes = await resolveRemotes(repoId);
  return remotes ? forgeFromRemotes(remotes) : null;
}

/** No supported forge remote at all — a permanent, non-error condition for a repo. */
const NO_FORGE = 'This repository has no supported forge remote.';

/**
 * The reason code an unavailable repo reports. Reuses `not-installed`
 * deliberately rather than growing a fourth arm: from the sidebar's point of
 * view "there is nothing here to show" is one state, and the `hint` carries
 * the difference in words.
 */
export const noForgeStatus = (): ForgeCliStatus => ({
  reason: 'not-installed',
  binPath: null,
  hint: NO_FORGE,
});

/**
 * The one place a `repoId` becomes a `{forge, adapter}` pair — `registry.ts`'s
 * single dispatch point plus the active account for the forge's host. Exported
 * for the composer's workflow gates and executors, which need exactly this
 * pair from a `repoId` alone.
 */
export async function resolveAdapter(repoId: string): Promise<{ forge: Forge; adapter: ForgeAdapter } | null> {
  const forge = await repoForge(repoId);
  if (!forge) return null;
  const account = await activeAccountFor(forge);
  const adapter = adapterFor(forge, account);
  if (!adapter) return null;
  return { forge, adapter };
}

/**
 * The graph CI column's batched lookup — one instance for the process, so its
 * per-sha cache and the shared recent listing outlive any one request.
 */
export const commitRuns = createCommitRunsService({
  resolve: resolveAdapter,
  noForge: noForgeStatus,
});

/** Test seam — the resolver is module state. */
export function __resetRepoRemotesForTests(): void {
  resolveRemotes = async () => null;
}
