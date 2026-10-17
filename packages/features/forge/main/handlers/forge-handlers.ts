import {
  CHANNELS,
  schemas,
  type ForgeCommitRunsResult,
  type ForgeIssueCommentsResult,
  type ForgeIssueCreateResult,
  type ForgeIssueDetailResult,
  type ForgeIssuesResult,
  type ForgeLinkWriteResult,
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

import type { RuntimeIpc } from '@midnite/studio-runtime';

import { ghStatus } from '../github/gh-shell';
import { commitRuns, noForgeStatus, resolveAdapter } from '../repo-forge';

/**
 * Forge listings and writes, dispatched through `registry.ts`'s `adapterFor`
 * rather than calling `gh-*.ts` directly (Phase 90 Theme D). Every handler
 * below is provider-blind: it resolves a repo's forge and its adapter, and
 * calls the same method name regardless of which provider answers it.
 *
 * The repo's forge identity is resolved in main (`repo-forge.ts`) rather than
 * sent from the renderer, so the owner/repo pair reaching a subprocess or a
 * request is never a value a renderer chose — the only thing crossing is a
 * `repoId`.
 */

/**
 * A write against a repository that has no forge to write to.
 *
 * `ok: false` with a null error, matching `notReady` in `gh-write.ts`: nothing
 * failed, because nothing was attempted. The `cli` hint says which.
 */
const noForgeWrite = (): ForgeWriteResult => ({ ok: false, cli: noForgeStatus(), error: null });

/** The `ForgeLinkWriteResult`-shaped twin of {@link noForgeWrite} — no `via`,
 *  since nothing was attempted. */
const noForgeLinkWrite = (): ForgeLinkWriteResult => ({ ok: false, cli: noForgeStatus(), error: null });

/** The `ForgeIssueCreateResult`-shaped twin of {@link noForgeWrite}. */
const noForgeIssueCreate = (): ForgeIssueCreateResult => ({ ok: false, cli: noForgeStatus(), error: null });

export function registerForgeHandlers(ipc: RuntimeIpc): void {
  ipc.handleBare(CHANNELS.forgeCliStatus, () => ghStatus());

  ipc.handle<typeof schemas.ForgeCommitRunsRequest, ForgeCommitRunsResult>(
    CHANNELS.forgeCommitRuns,
    schemas.ForgeCommitRunsRequest,
    (req) => commitRuns.lookup(req.repoId, req.shas),
    (issue) => ({ cli: noForgeStatus(), runs: {}, error: issue }),
  );

  ipc.handle<typeof schemas.ForgeRunsRequest, ForgeRunsResult>(
    CHANNELS.forgeRuns,
    schemas.ForgeRunsRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), runs: [], error: null };
      return resolved.adapter.listRuns(resolved.forge, {
        limit: req.limit,
        ...(req.branch ? { branch: req.branch } : {}),
      });
    },
    (issue) => ({ cli: noForgeStatus(), runs: [], error: issue }),
  );

  ipc.handle<typeof schemas.ForgePullsRequest, ForgePullsResult>(
    CHANNELS.forgePulls,
    schemas.ForgePullsRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), pulls: [], error: null };
      return resolved.adapter.listPulls(resolved.forge, {
        limit: req.limit,
        state: req.state,
        scope: req.scope,
      });
    },
    (issue) => ({ cli: noForgeStatus(), pulls: [], error: issue }),
  );

  /*
    The three pull-request detail channels. Each resolves owner/repo here from
    `.git/config` exactly as its siblings do, so the only values the renderer
    ever chooses are a `repoId` and a PR number the schema has already bounded
    to a positive integer.
  */

  ipc.handle<typeof schemas.ForgePullDetailRequest, ForgePullDetailResult>(
    CHANNELS.forgePullDetail,
    schemas.ForgePullDetailRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), detail: null, error: null };
      return resolved.adapter.pullDetail(resolved.forge, req.number);
    },
    (issue) => ({ cli: noForgeStatus(), detail: null, error: issue }),
  );

  ipc.handle<typeof schemas.ForgePullFilesRequest, ForgePullFilesResult>(
    CHANNELS.forgePullFiles,
    schemas.ForgePullFilesRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), files: null, error: null };
      return resolved.adapter.pullFiles(resolved.forge, req.number);
    },
    (issue) => ({ cli: noForgeStatus(), files: null, error: issue }),
  );

  ipc.handle<typeof schemas.ForgePullCommentsRequest, ForgePullCommentsResult>(
    CHANNELS.forgePullComments,
    schemas.ForgePullCommentsRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), comments: [], error: null };
      return resolved.adapter.pullComments(resolved.forge, req.number);
    },
    (issue) => ({ cli: noForgeStatus(), comments: [], error: issue }),
  );

  ipc.handle<typeof schemas.ForgePullThreadsRequest, ForgePullThreadsResult>(
    CHANNELS.forgePullThreads,
    schemas.ForgePullThreadsRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), threads: [], error: null };
      return resolved.adapter.pullThreads(resolved.forge, req.number);
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
    - A repo with no adapter to write through answers `ok: false` with a null
      error — the same "nothing to say" shape the reads use. Not a failure:
      there was nothing to write to.
    - A rejected payload lands in the `(issue) =>` arm as `ok: false` plus the
      validation text, so a malformed request from a stale renderer is a
      message beside the button, never a thrown handler.
  */

  ipc.handle<typeof schemas.ForgeReviewCommentRequest, ForgeWriteResult>(
    CHANNELS.forgeReviewComment,
    schemas.ForgeReviewCommentRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.addReviewComment(resolved.forge, {
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

  ipc.handle<typeof schemas.ForgeReviewReplyRequest, ForgeWriteResult>(
    CHANNELS.forgeReviewReply,
    schemas.ForgeReviewReplyRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.replyToReviewComment(resolved.forge, {
        number: req.number,
        commentId: req.commentId,
        body: req.body,
      });
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgeResolveThreadRequest, ForgeWriteResult>(
    CHANNELS.forgeResolveThread,
    schemas.ForgeResolveThreadRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.setThreadResolved(resolved.forge, {
        threadId: req.threadId,
        resolved: req.resolved,
      });
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgePullReviewRequest, ForgeWriteResult>(
    CHANNELS.forgePullReview,
    schemas.ForgePullReviewRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.reviewPull(resolved.forge, req.number, req.event, req.body);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgePullCommentRequest, ForgeWriteResult>(
    CHANNELS.forgePullComment,
    schemas.ForgePullCommentRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.commentPull(resolved.forge, req.number, req.body);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgePullMergeRequest, ForgeWriteResult>(
    CHANNELS.forgePullMerge,
    schemas.ForgePullMergeRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.mergePull(resolved.forge, req.number, req.method);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgePullRequestReviewRequest, ForgeWriteResult>(
    CHANNELS.forgePullRequestReview,
    schemas.ForgePullRequestReviewRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.requestReview(resolved.forge, req.number, req.reviewers);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgePullReadyRequest, ForgeWriteResult>(
    CHANNELS.forgePullReady,
    schemas.ForgePullReadyRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.markReady(resolved.forge, req.number);
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
    answer main would serve from a stale map anyway. It is an optional adapter
    method — GitHub-cache-specific housekeeping, not part of every provider's
    contract — so the call is a no-op for an adapter that has none.

    The renderer still invalidates the run *listing* — that is where the reset
    status and the new attempt count show up.
  */
  ipc.handle<typeof schemas.ForgeRunRerunRequest, ForgeWriteResult>(
    CHANNELS.forgeRunRerun,
    schemas.ForgeRunRerunRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      const result = await resolved.adapter.rerunChecks(resolved.forge, req.runId, req.failedOnly);
      if (result.ok) resolved.adapter.forgetRun?.(resolved.forge, req.runId);
      return result;
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgeIssuesRequest, ForgeIssuesResult>(
    CHANNELS.forgeIssues,
    schemas.ForgeIssuesRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      // No adapter is not "issues are disabled" — the repository has no
      // issue tracker to have an opinion about, which the `cli` reason says.
      if (!resolved) return { cli: noForgeStatus(), issues: [], disabled: false, error: null };
      return resolved.adapter.listIssues(resolved.forge, { limit: req.limit, state: req.state });
    },
    (issue) => ({ cli: noForgeStatus(), issues: [], disabled: false, error: issue }),
  );

  /*
    The two issue detail channels — the same split reasoning as the pull
    request trio above: a body and a conversation are payloads the list never
    needs, so opening an issue costs two more subprocesses only when a reader
    actually opens one.
  */

  ipc.handle<typeof schemas.ForgeIssueDetailRequest, ForgeIssueDetailResult>(
    CHANNELS.forgeIssueDetail,
    schemas.ForgeIssueDetailRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), issue: null, error: null };
      return resolved.adapter.issueDetail(resolved.forge, req.number);
    },
    (error) => ({ cli: noForgeStatus(), issue: null, error }),
  );

  ipc.handle<typeof schemas.ForgeIssueCommentsRequest, ForgeIssueCommentsResult>(
    CHANNELS.forgeIssueComments,
    schemas.ForgeIssueCommentsRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), comments: [], error: null };
      return resolved.adapter.issueComments(resolved.forge, req.number);
    },
    (error) => ({ cli: noForgeStatus(), comments: [], error }),
  );

  /*
    The two issue writes (Phase 54 Theme G), and the only two this app makes.
    Same discipline as the pull-request writes above: owner/repo resolved
    here, never sent; `ok: false` with no error when there is no forge to
    write to; a rejected payload lands as `ok: false` plus the validation text.
  */

  ipc.handle<typeof schemas.ForgeIssueCommentRequest, ForgeWriteResult>(
    CHANNELS.forgeIssueComment,
    schemas.ForgeIssueCommentRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.commentIssue(resolved.forge, req.number, req.body);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgeIssueSetStateRequest, ForgeWriteResult>(
    CHANNELS.forgeIssueSetState,
    schemas.ForgeIssueSetStateRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.setIssueState(resolved.forge, req.number, req.state);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgeRunDetailRequest, ForgeRunDetailResult>(
    CHANNELS.forgeRunDetail,
    schemas.ForgeRunDetailRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), detail: null, error: null };
      return resolved.adapter.runDetail(resolved.forge, req.runId);
    },
    (issue) => ({ cli: noForgeStatus(), detail: null, error: issue }),
  );

  ipc.handle<typeof schemas.ForgeRunLogRequest, ForgeRunLogResult>(
    CHANNELS.forgeRunLog,
    schemas.ForgeRunLogRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), log: null, pending: false, error: null };
      return resolved.adapter.runLog(resolved.forge, req.runId, {
        ...(req.jobId ? { jobId: req.jobId } : {}),
        ...(req.full ? { full: true } : {}),
      });
    },
    (issue) => ({ cli: noForgeStatus(), log: null, pending: false, error: issue }),
  );

  ipc.handle<typeof schemas.ForgeWorkflowsRequest, ForgeWorkflowsResult>(
    CHANNELS.forgeWorkflows,
    schemas.ForgeWorkflowsRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return { cli: noForgeStatus(), workflows: [], error: null };
      return resolved.adapter.listWorkflows(resolved.forge);
    },
    (issue) => ({ cli: noForgeStatus(), workflows: [], error: issue }),
  );

  /*
    ─── Issue and dependency-link CRUD (Phase 95 Theme D) ────────────────────

    Same discipline as every write above: owner/repo resolved from
    `.git/config` on this side, never sent; no adapter for the repo's forge
    answers `ok: false` with a null error (nothing was attempted); a rejected
    payload lands as `ok: false` plus the validation text. `capabilitiesFor
    (kind).ops` (read by the UI, not enforced here) says which of these a
    given repo's forge actually implements — an adapter with no real write
    for an op still answers through the same envelope (an honest
    `unsupportedWrite`), never a channel that does not exist.
  */

  ipc.handle<typeof schemas.ForgeIssueCreateRequest, ForgeIssueCreateResult>(
    CHANNELS.forgeIssueCreate,
    schemas.ForgeIssueCreateRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeIssueCreate();
      return resolved.adapter.createIssue(resolved.forge, {
        title: req.title,
        body: req.body,
        labels: req.labels,
        assignees: req.assignees,
        ...(req.milestone === undefined ? {} : { milestone: req.milestone }),
      });
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgeIssueEditRequest, ForgeWriteResult>(
    CHANNELS.forgeIssueEdit,
    schemas.ForgeIssueEditRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.editIssue(resolved.forge, req.number, {
        ...(req.title === undefined ? {} : { title: req.title }),
        ...(req.body === undefined ? {} : { body: req.body }),
        ...(req.labels === undefined ? {} : { labels: req.labels }),
        ...(req.assignees === undefined ? {} : { assignees: req.assignees }),
        ...(req.milestone === undefined ? {} : { milestone: req.milestone }),
      });
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgeIssueDeleteRequest, ForgeWriteResult>(
    CHANNELS.forgeIssueDelete,
    schemas.ForgeIssueDeleteRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeWrite();
      return resolved.adapter.deleteIssue(resolved.forge, req.number);
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgeIssuesLinkRequest, ForgeLinkWriteResult>(
    CHANNELS.forgeIssuesLink,
    schemas.ForgeIssuesLinkRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeLinkWrite();
      return resolved.adapter.linkIssues(resolved.forge, {
        kind: req.kind,
        number: req.number,
        targetNumber: req.targetNumber,
        targetRepo: req.targetRepo,
      });
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );

  ipc.handle<typeof schemas.ForgeIssuesUnlinkRequest, ForgeLinkWriteResult>(
    CHANNELS.forgeIssuesUnlink,
    schemas.ForgeIssuesUnlinkRequest,
    async (req) => {
      const resolved = await resolveAdapter(req.repoId);
      if (!resolved) return noForgeLinkWrite();
      return resolved.adapter.unlinkIssues(resolved.forge, {
        kind: req.kind,
        number: req.number,
        targetNumber: req.targetNumber,
        targetRepo: req.targetRepo,
      });
    },
    (issue) => ({ ok: false, cli: noForgeStatus(), error: issue }),
  );
}
