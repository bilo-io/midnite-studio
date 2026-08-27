import { listRemotes } from '@midnite/git-engine';
import {
  CHANNELS,
  pickForgeRemote,
  schemas,
  type Forge,
  type ForgeCliStatus,
  type ForgeIssuesResult,
  type ForgePullCommentsResult,
  type ForgePullDetailResult,
  type ForgePullFilesResult,
  type ForgePullsResult,
  type ForgeRunDetailResult,
  type ForgeRunLogResult,
  type ForgeRunsResult,
  type ForgeWorkflowsResult,
} from '@midnite/git-shared';

import {
  ghStatus,
  listIssues,
  listPulls,
  listRuns,
  listWorkflows,
  pullComments,
  pullDetail,
  pullFiles,
  runDetail,
  runLog,
} from '../forge/gh-cli';
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

  /*
    The three pull-request detail channels. Each resolves owner/repo here from
    `.git/config` exactly as its siblings do, so the only values the renderer
    ever chooses are a `repoId` and a PR number the schema has already bounded
    to a positive integer.
  */

  handle<typeof schemas.ForgePullDetailRequest, ForgePullDetailResult>(
    CHANNELS.forgePullDetail,
    schemas.ForgePullDetailRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), detail: null, error: null };
      return pullDetail(forge, req.number);
    },
    (issue) => ({ cli: noForgeStatus(), detail: null, error: issue }),
  );

  handle<typeof schemas.ForgePullFilesRequest, ForgePullFilesResult>(
    CHANNELS.forgePullFiles,
    schemas.ForgePullFilesRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), files: null, error: null };
      return pullFiles(forge, req.number);
    },
    (issue) => ({ cli: noForgeStatus(), files: null, error: issue }),
  );

  handle<typeof schemas.ForgePullCommentsRequest, ForgePullCommentsResult>(
    CHANNELS.forgePullComments,
    schemas.ForgePullCommentsRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), comments: [], error: null };
      return pullComments(forge, req.number);
    },
    (issue) => ({ cli: noForgeStatus(), comments: [], error: issue }),
  );

  handle<typeof schemas.ForgeIssuesRequest, ForgeIssuesResult>(
    CHANNELS.forgeIssues,
    schemas.ForgeIssuesRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      // No GitHub remote is not "issues are disabled" — the repository has no
      // issue tracker to have an opinion about, which the `cli` reason says.
      if (!forge) return { cli: noForgeStatus(), issues: [], disabled: false, error: null };
      return listIssues(forge, { limit: req.limit, state: req.state });
    },
    (issue) => ({ cli: noForgeStatus(), issues: [], disabled: false, error: issue }),
  );

  handle<typeof schemas.ForgeRunDetailRequest, ForgeRunDetailResult>(
    CHANNELS.forgeRunDetail,
    schemas.ForgeRunDetailRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), detail: null, error: null };
      return runDetail(forge, req.runId);
    },
    (issue) => ({ cli: noForgeStatus(), detail: null, error: issue }),
  );

  handle<typeof schemas.ForgeRunLogRequest, ForgeRunLogResult>(
    CHANNELS.forgeRunLog,
    schemas.ForgeRunLogRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), log: null, pending: false, error: null };
      return runLog(forge, req.runId, {
        ...(req.jobId ? { jobId: req.jobId } : {}),
        ...(req.full ? { full: true } : {}),
      });
    },
    (issue) => ({ cli: noForgeStatus(), log: null, pending: false, error: issue }),
  );

  handle<typeof schemas.ForgeWorkflowsRequest, ForgeWorkflowsResult>(
    CHANNELS.forgeWorkflows,
    schemas.ForgeWorkflowsRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), workflows: [], error: null };
      return listWorkflows(forge);
    },
    (issue) => ({ cli: noForgeStatus(), workflows: [], error: issue }),
  );
}
