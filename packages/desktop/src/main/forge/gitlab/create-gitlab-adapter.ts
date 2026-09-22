import { capabilitiesFor, type Forge } from '@midnite/studio-shared';

import type { ForgeAdapter } from '../adapter';
import { gitlabWhoami } from '../whoami';
import { boardFields, boardItems, listBoards, setItemField } from './gitlab-board';
import type { GitLabContext } from './gitlab-client';
import {
  issueComments,
  issueDetail,
  listIssues,
  listPulls,
  listRuns,
  listWorkflows,
  pullComments,
  pullDetail,
  pullFiles,
  pullThreads,
  runDetail,
  runLog,
} from './gitlab-read';
import {
  addReviewComment,
  commentIssue,
  commentPull,
  markReady,
  mergePull,
  replyToReviewComment,
  requestReview,
  rerunChecks,
  reviewPull,
  setIssueState,
  setThreadResolved,
} from './gitlab-write';

/**
 * GitLab's `ForgeAdapter` (Phase 90 Theme E) — every method binds `ctx`
 * (the account's token, resolved once by `registry.ts`) ahead of the
 * `(forge, …)` signature the interface declares, mirroring
 * `github/create-github-adapter.ts`'s role for GitHub's `gh` binding.
 *
 * `forgetRun` is omitted — GitLab pipelines are read fresh on every call
 * (no in-process cache the way `gh-cache.ts` keeps for GitHub's run list),
 * so there is nothing to evict after a re-run. `listRepos` is omitted for
 * the same reason Theme D left it off GitHub's adapter: no caller reaches
 * it through this interface yet — `reachable-repos.ts` is where Theme E's
 * own repo listing lives instead (see that module's docblock).
 */
export function createGitLabAdapter(ctx: GitLabContext): ForgeAdapter {
  return {
    kind: 'gitlab',

    listRuns: (forge, options) => listRuns(ctx, forge, options),
    runDetail: (forge, runId) => runDetail(ctx, forge, runId),
    runLog: (forge, runId, options) => runLog(ctx, forge, runId, options),
    listWorkflows: (forge) => listWorkflows(ctx, forge),

    listPulls: (forge, options) => listPulls(ctx, forge, options),
    pullDetail: (forge, number) => pullDetail(ctx, forge, number),
    pullFiles: (forge, number) => pullFiles(ctx, forge, number),
    pullComments: (forge, number) => pullComments(ctx, forge, number),
    pullThreads: (forge, number) => pullThreads(ctx, forge, number),

    listIssues: (forge, options) => listIssues(ctx, forge, options),
    issueDetail: (forge, number) => issueDetail(ctx, forge, number),
    issueComments: (forge, number) => issueComments(ctx, forge, number),

    listBoards: (forge) => listBoards(ctx, forge),
    boardFields: (forge, projectId) => boardFields(ctx, forge, projectId),
    boardItems: (forge, projectId, cursor) => boardItems(ctx, forge, projectId, cursor),

    addReviewComment: (forge, request) => addReviewComment(ctx, forge, request),
    replyToReviewComment: (forge, request) => replyToReviewComment(ctx, forge, request),
    setThreadResolved: (forge, request) => setThreadResolved(ctx, forge, request),
    reviewPull: (forge, number, event, body) => reviewPull(ctx, forge, number, event, body),
    commentPull: (forge, number, body) => commentPull(ctx, forge, number, body),
    mergePull: (forge, number, method) => mergePull(ctx, forge, number, method),
    requestReview: (forge, number, reviewers) => requestReview(ctx, forge, number, reviewers),
    markReady: (forge, number) => markReady(ctx, forge, number),
    rerunChecks: (forge, runId, failedOnly) => rerunChecks(ctx, forge, runId, failedOnly),

    commentIssue: (forge, number, body) => commentIssue(ctx, forge, number, body),
    setIssueState: (forge, number, state) => setIssueState(ctx, forge, number, state),

    setItemField: (forge, request) => setItemField(ctx, forge, request),

    whoami: (forge: Forge) => gitlabWhoami(forge.host, ctx.token),

    capabilities: () => capabilitiesFor('gitlab'),
  };
}
