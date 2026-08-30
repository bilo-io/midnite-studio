import { listRemotes } from '@midnite/studio-git-engine';
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
  type ForgePullThreadsResult,
  type ForgeRunDetailResult,
  type ForgeRunLogResult,
  type ForgeRunsResult,
  type ForgeWorkflowsResult,
  type ForgeWriteResult,
} from '@midnite/studio-shared';

import {
  listIssues,
  listPulls,
  listRuns,
  listWorkflows,
  pullComments,
  pullDetail,
  forgetRun,
  pullFiles,
  runDetail,
  runLog,
} from '../forge/gh-cli';
import { ghStatus } from '../forge/gh-shell';
import { pullThreads } from '../forge/gh-graphql';
import {
  addReviewComment,
  commentPull,
  markReady,
  mergePull,
  replyToReviewComment,
  requestReview,
  rerunChecks,
  reviewPull,
  setThreadResolved,
} from '../forge/gh-write';
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

/**
 * A write against a repository that has no forge to write to.
 *
 * `ok: false` with a null error, matching `notReady` in `gh-write.ts`: nothing
 * failed, because nothing was attempted. The `cli` hint says which.
 */
const noForgeWrite = (): ForgeWriteResult => ({ ok: false, cli: noForgeStatus(), error: null });

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
      return listPulls(forge, { limit: req.limit, state: req.state, scope: req.scope });
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

  handle<typeof schemas.ForgePullThreadsRequest, ForgePullThreadsResult>(
    CHANNELS.forgePullThreads,
    schemas.ForgePullThreadsRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return { cli: noForgeStatus(), threads: [], error: null };
      return pullThreads(forge, req.number);
    },
    (issue) => ({ cli: noForgeStatus(), threads: [], error: issue }),
  );

  /*
    ─── The write channels (Phase 20 Themes E, F and G) ─────────────────────

    The one place in this app that changes state on a forge — nine channels,
    all of them about reviewing a pull request. Three properties hold here that
    hold nowhere else in this file, and all three are the reason the exception
    is safe to make:

    - Owner and repo are still resolved from `.git/config` on THIS side. A
      write is exactly the wrong operation to let the renderer aim.
    - A repo with no GitHub remote answers `ok: false` with a null error — the
      same "nothing to say" shape the reads use. Not a failure: there was
      nothing to write to.
    - A rejected payload lands in the `(issue) =>` arm as `ok: false` plus the
      validation text, so a malformed request from a stale renderer is a
      message beside the button, never a thrown handler.
  */

  handle<typeof schemas.ForgeReviewCommentRequest, ForgeWriteResult>(
    CHANNELS.forgeReviewComment,
    schemas.ForgeReviewCommentRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return noForgeWrite();
      return addReviewComment(forge, {
        number: req.number,
        commitId: req.commitId,
        path: req.path,
        line: req.line,
        side: req.side,
        ...(req.position === undefined ? {} : { position: req.position }),
        body: req.body,
      });
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  handle<typeof schemas.ForgeReviewReplyRequest, ForgeWriteResult>(
    CHANNELS.forgeReviewReply,
    schemas.ForgeReviewReplyRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return noForgeWrite();
      return replyToReviewComment(forge, {
        number: req.number,
        commentId: req.commentId,
        body: req.body,
      });
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  handle<typeof schemas.ForgeResolveThreadRequest, ForgeWriteResult>(
    CHANNELS.forgeResolveThread,
    schemas.ForgeResolveThreadRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return noForgeWrite();
      return setThreadResolved(forge, { threadId: req.threadId, resolved: req.resolved });
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  handle<typeof schemas.ForgePullReviewRequest, ForgeWriteResult>(
    CHANNELS.forgePullReview,
    schemas.ForgePullReviewRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return noForgeWrite();
      return reviewPull(forge, req.number, req.event, req.body);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  handle<typeof schemas.ForgePullCommentRequest, ForgeWriteResult>(
    CHANNELS.forgePullComment,
    schemas.ForgePullCommentRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return noForgeWrite();
      return commentPull(forge, req.number, req.body);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  handle<typeof schemas.ForgePullMergeRequest, ForgeWriteResult>(
    CHANNELS.forgePullMerge,
    schemas.ForgePullMergeRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return noForgeWrite();
      return mergePull(forge, req.number, req.method);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  handle<typeof schemas.ForgePullRequestReviewRequest, ForgeWriteResult>(
    CHANNELS.forgePullRequestReview,
    schemas.ForgePullRequestReviewRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return noForgeWrite();
      return requestReview(forge, req.number, req.reviewers);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  handle<typeof schemas.ForgePullReadyRequest, ForgeWriteResult>(
    CHANNELS.forgePullReady,
    schemas.ForgePullReadyRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return noForgeWrite();
      return markReady(forge, req.number);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  /*
    The one write that has to evict a cache, and the only one.

    `gh run rerun` does not create a new run — it adds an attempt to the same run
    id. Main caches a run's job tree and logs permanently once it has completed,
    on the reasonable assumption that a finished run is finished; a re-run breaks
    exactly that assumption for exactly one key. So `forgetRun` drops it here, in
    the handler, rather than leaving the renderer to invalidate a query whose
    answer main would serve from a stale map anyway.

    The renderer still invalidates the run *listing* — that is where the reset
    status and the new attempt count show up.
  */
  handle<typeof schemas.ForgeRunRerunRequest, ForgeWriteResult>(
    CHANNELS.forgeRunRerun,
    schemas.ForgeRunRerunRequest,
    async (req) => {
      const forge = await githubForge(req.repoId);
      if (!forge) return noForgeWrite();
      const result = await rerunChecks(forge, req.runId, req.failedOnly);
      if (result.ok) forgetRun(forge, req.runId);
      return result;
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
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
