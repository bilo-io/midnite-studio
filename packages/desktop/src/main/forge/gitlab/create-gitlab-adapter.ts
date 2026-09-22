import { capabilitiesFor, type Forge, type ForgeAccount } from '@midnite/studio-shared';

import type { ForgeAdapter } from '../adapter';
import { gitlabWhoami } from '../whoami';
import { boardFields, boardItems, listBoards, setItemField } from './gitlab-board';
import { resolveToken } from './gitlab-client';
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
 * GitLab's `ForgeAdapter` (Phase 90 Theme E) — bound to one `account` closed
 * over here, matching `create-bitbucket-adapter.ts`'s shape: `registry.ts`
 * resolves the account once per repo before dispatch, and every read/write
 * below resolves that account's vaulted token lazily, per call
 * (`gitlab-client.ts`'s `resolveToken`), rather than eagerly up front.
 *
 * `forgetRun` is omitted — GitLab pipelines are read fresh on every call
 * (no in-process cache the way `gh-cache.ts` keeps for GitHub's run list),
 * so there is nothing to evict after a re-run. `listRepos` is omitted for
 * the same reason Theme D left it off GitHub's adapter: no caller reaches
 * it through this interface yet — `reachable-repos.ts` is where GitLab's
 * own repo listing lives instead (see that module's docblock).
 */
export function createGitLabAdapter(account: ForgeAccount | null): ForgeAdapter {
  return {
    kind: 'gitlab',

    listRuns: (forge, options) => listRuns(forge, account, options),
    runDetail: (forge, runId) => runDetail(forge, account, runId),
    runLog: (forge, runId, options) => runLog(forge, account, runId, options),
    listWorkflows: (forge) => listWorkflows(forge, account),

    listPulls: (forge, options) => listPulls(forge, account, options),
    pullDetail: (forge, number) => pullDetail(forge, account, number),
    pullFiles: (forge, number) => pullFiles(forge, account, number),
    pullComments: (forge, number) => pullComments(forge, account, number),
    pullThreads: (forge, number) => pullThreads(forge, account, number),

    listIssues: (forge, options) => listIssues(forge, account, options),
    issueDetail: (forge, number) => issueDetail(forge, account, number),
    issueComments: (forge, number) => issueComments(forge, account, number),

    listBoards: (forge) => listBoards(forge, account),
    boardFields: (forge, projectId) => boardFields(forge, account, projectId),
    boardItems: (forge, projectId, cursor) => boardItems(forge, account, projectId, cursor),

    addReviewComment: (forge, request) => addReviewComment(forge, account, request),
    replyToReviewComment: (forge, request) => replyToReviewComment(forge, account, request),
    setThreadResolved: (forge, request) => setThreadResolved(forge, account, request),
    reviewPull: (forge, number, event, body) => reviewPull(forge, account, number, event, body),
    commentPull: (forge, number, body) => commentPull(forge, account, number, body),
    mergePull: (forge, number, method) => mergePull(forge, account, number, method),
    requestReview: (forge, number, reviewers) => requestReview(forge, account, number, reviewers),
    markReady: (forge, number) => markReady(forge, account, number),
    rerunChecks: (forge, runId, failedOnly) => rerunChecks(forge, account, runId, failedOnly),

    commentIssue: (forge, number, body) => commentIssue(forge, account, number, body),
    setIssueState: (forge, number, state) => setIssueState(forge, account, number, state),

    setItemField: (forge, request) => setItemField(forge, account, request),

    whoami: async (forge: Forge) => {
      const token = await resolveToken(account);
      return token ? gitlabWhoami(forge.host, token) : null;
    },

    capabilities: () => capabilitiesFor('gitlab'),
  };
}
