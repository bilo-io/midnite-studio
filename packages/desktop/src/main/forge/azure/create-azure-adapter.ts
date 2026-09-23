import { capabilitiesFor, type ForgeAccount } from '@midnite/studio-shared';

import type { ForgeAdapter } from '../adapter';
import { resolveAzureToken } from './azure-client';
import { boardFields, boardItems, listBoards, setItemField as boardSetItemField } from './azure-board';
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
} from './azure-reads';
import {
  addProjectItem,
  addReviewComment,
  commentIssue,
  commentPull,
  createIssue,
  createProject,
  deleteIssue,
  deleteProject,
  editIssue,
  editProject,
  linkIssues,
  markReady,
  mergePull,
  removeProjectItem,
  replyToReviewComment,
  requestReview,
  rerunChecks,
  reviewPull,
  setIssueState,
  setThreadResolved,
  unlinkIssues,
} from './azure-writes';
import { azureWhoami } from '../whoami';

/**
 * Azure DevOps's `ForgeAdapter` (Phase 90 Theme G) — the third provider,
 * bound to one `account` the same way `create-gitlab-adapter.ts` and
 * `create-bitbucket-adapter.ts` already are: closed over here rather than
 * threaded through every call, with the account's vaulted PAT resolved
 * lazily, per call, inside `azure-client.ts`.
 *
 * `forgetRun` is omitted — Azure builds are read fresh on every call, the
 * same reason `create-gitlab-adapter.ts` leaves it off. `listRepos` is
 * omitted for the identical reason both predecessors give: no caller
 * reaches it through this interface yet (`reachable-repos.ts` is where a
 * real Azure listing lives instead).
 */
export function createAzureAdapter(account: ForgeAccount | null): ForgeAdapter {
  return {
    kind: 'azure',

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

    setItemField: (forge, request) => boardSetItemField(forge, account, request),

    createIssue: (forge, request) => createIssue(forge, account, request),
    editIssue: (forge, number, request) => editIssue(forge, account, number, request),
    deleteIssue: (forge, number) => deleteIssue(forge, account, number),

    createProject: () => createProject(account),
    editProject: () => editProject(account),
    deleteProject: () => deleteProject(account),

    addProjectItem: (_forge, request) => addProjectItem(account, request),
    removeProjectItem: () => removeProjectItem(account),

    linkIssues: (forge, request) => linkIssues(forge, account, request),
    unlinkIssues: (forge, request) => unlinkIssues(forge, account, request),

    whoami: async () => {
      const token = await resolveAzureToken(account);
      return token ? azureWhoami(token) : null;
    },

    capabilities: () => capabilitiesFor('azure'),
  };
}
