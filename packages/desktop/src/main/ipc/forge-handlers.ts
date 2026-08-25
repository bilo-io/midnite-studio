import { listRemotes } from '@midnite/git-engine';
import {
  CHANNELS,
  pickForgeRemote,
  schemas,
  type Forge,
  type ForgeCliStatus,
  type ForgePullsResult,
  type ForgeRunsResult,
} from '@midnite/git-shared';

import { ghStatus, listPulls, listRuns } from '../forge/gh-cli';
import { resolveWorkdir } from '../repo-registry';
import { handle, handleBare } from './handle';

/**
 * GitHub listings, read through the user's own `gh` CLI.
 *
 * The repo's GitHub identity is resolved HERE rather than sent from the
 * renderer. The renderer could compute it — it already has `Remote.forge` for
 * the sidebar — but then the owner/repo pair reaching a subprocess would be a
 * value chosen by the renderer, and the whole point of parsing payloads at
 * this boundary is that main does not take the renderer's word for arguments
 * it is about to execute with. Deriving it from `.git/config` on this side
 * means the only thing crossing is a `repoId`.
 */

/** No GitHub remote at all — a permanent, non-error condition for a repo. */
const NO_FORGE = 'This repository has no GitHub remote.';

async function githubForge(repoId: string): Promise<Forge | null> {
  const cwd = await resolveWorkdir(repoId);
  if (!cwd) return null;
  const forge = pickForgeRemote(await listRemotes(cwd))?.forge ?? null;
  // `gh` speaks GitHub only. A GitLab remote is not a failure to report — it
  // is a repository this feature has nothing to say about.
  return forge?.kind === 'github' ? forge : null;
}

/**
 * The reason code an unavailable repo reports.
 *
 * Reuses `not-installed` deliberately rather than growing a fourth arm: from
 * the sidebar's point of view "there is nothing here to show" is one state,
 * and the `hint` carries the difference in words.
 */
const noForgeStatus = (): ForgeCliStatus => ({
  reason: 'not-installed',
  binPath: null,
  hint: NO_FORGE,
});

export function registerForgeHandlers(): void {
  handleBare(CHANNELS.forgeCliStatus, () => ghStatus());

  handle<typeof schemas.ForgeRunsRequest, ForgeRunsResult>(
    CHANNELS.forgeRuns,
    schemas.ForgeRunsRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), runs: [], error: null };
      return listRuns(forge, {
        limit: req.limit,
        ...(req.branch ? { branch: req.branch } : {}),
      });
    },
    (issue) => ({ cli: noForgeStatus(), runs: [], error: issue }),
  );

  handle<typeof schemas.ForgePullsRequest, ForgePullsResult>(
    CHANNELS.forgePulls,
    schemas.ForgePullsRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), pulls: [], error: null };
      return listPulls(forge, { limit: req.limit });
    },
    (issue) => ({ cli: noForgeStatus(), pulls: [], error: issue }),
  );
}
