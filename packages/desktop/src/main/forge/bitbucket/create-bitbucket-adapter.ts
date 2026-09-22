import { capabilitiesFor, type Forge, type ForgeAccount } from '@midnite/studio-shared';

import type { ForgeAdapter } from '../adapter';
import { forgeAccountToken } from '../forge-accounts';
import { whoami as whoamiFor } from '../whoami';
import { bitbucketCliStatus } from './bitbucket-client';
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
} from './bitbucket-reads';
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
  setItemField,
  setThreadResolved,
} from './bitbucket-writes';

/**
 * Bitbucket Cloud's `ForgeAdapter` (Phase 90 Theme F). Bound to one account
 * — closed over here rather than threaded through every call, matching how
 * `registry.ts` already resolves the account once per repo before dispatch.
 * `whoami` and every read/write below ignore the `forge` parameter's `host`
 * because self-hosted Bitbucket Data Center is out of scope (the phase doc's
 * own "Not in this phase" — a different API version entirely); `forge.owner`
 * (the workspace) and `forge.repo` are what every call actually uses.
 */
export function createBitbucketAdapter(account: ForgeAccount | null): ForgeAdapter {
  return {
    kind: 'bitbucket',

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

    // Bitbucket has no project boards at all (`capabilities().projects` is
    // `'none'`, below) — the phase doc's own instruction is not to invent
    // one, so these three answer honestly empty rather than erroring.
    listBoards: async () => ({ cli: await bitbucketCliStatus(account), projects: [], error: null, kind: 'ok' }),
    boardFields: async () => ({ cli: await bitbucketCliStatus(account), fields: [], error: null, kind: 'ok' }),
    boardItems: async () => ({
      cli: await bitbucketCliStatus(account),
      items: [],
      nextCursor: null,
      error: null,
      kind: 'ok',
    }),

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

    setItemField: () => setItemField(account),

    whoami: async (forge: Forge) => {
      if (!account || account.delegated !== null) return null;
      const token = await forgeAccountToken(account);
      if (!token) return null;
      return whoamiFor('bitbucket', forge.host, token);
    },

    capabilities: () => capabilitiesFor('bitbucket'),
  };
}
