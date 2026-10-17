import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Coder exposes — exactly what the forge and tests features'
 * renderers and Coder's repository list call, and nothing else: `forge.*`, `forgeProject.*`,
 * `forgeAccounts.*` (records with a `hasToken` boolean, never a token), `tests.*`, `remotes.list`
 * and four `repos` members. There is no `secrets`, `fs`, `pty` or `ops` namespace: a forge token is
 * read in main only, and nothing here can write to a checkout (`bridge.test.ts` holds the list).
 */
export type CoderBridge = {
  forge: MidniteStudioBridge['forge'];
  forgeProject: MidniteStudioBridge['forgeProject'];
  forgeAccounts: MidniteStudioBridge['forgeAccounts'];
  tests: MidniteStudioBridge['tests'];
  remotes: MidniteStudioBridge['remotes'];
  repos: Pick<MidniteStudioBridge['repos'], 'list' | 'pickDirectory' | 'open' | 'close'>;
};

export type { RendererIpc };

export function createCoderBridge(ipc: RendererIpc): CoderBridge {
  const { call, send, subscribe } = createBridgeSlice(ipc);
  return {
    forge: {
      cliStatus: () => call(CHANNELS.forgeCliStatus),
      runs: (req) => call(CHANNELS.forgeRuns, req),
      pulls: (req) => call(CHANNELS.forgePulls, req),
      issues: (req) => call(CHANNELS.forgeIssues, req),
      issueDetail: (req) => call(CHANNELS.forgeIssueDetail, req),
      issueComments: (req) => call(CHANNELS.forgeIssueComments, req),
      issueComment: (req) => call(CHANNELS.forgeIssueComment, req),
      issueSetState: (req) => call(CHANNELS.forgeIssueSetState, req),
      issueCreate: (req) => call(CHANNELS.forgeIssueCreate, req),
      issueEdit: (req) => call(CHANNELS.forgeIssueEdit, req),
      issueDelete: (req) => call(CHANNELS.forgeIssueDelete, req),
      issuesLink: (req) => call(CHANNELS.forgeIssuesLink, req),
      issuesUnlink: (req) => call(CHANNELS.forgeIssuesUnlink, req),
      runDetail: (req) => call(CHANNELS.forgeRunDetail, req),
      runLog: (req) => call(CHANNELS.forgeRunLog, req),
      workflows: (req) => call(CHANNELS.forgeWorkflows, req),
      commitRuns: (req) => call(CHANNELS.forgeCommitRuns, req),
      pullDetail: (req) => call(CHANNELS.forgePullDetail, req),
      pullFiles: (req) => call(CHANNELS.forgePullFiles, req),
      pullComments: (req) => call(CHANNELS.forgePullComments, req),
      pullThreads: (req) => call(CHANNELS.forgePullThreads, req),
      reviewComment: (req) => call(CHANNELS.forgeReviewComment, req),
      reviewReply: (req) => call(CHANNELS.forgeReviewReply, req),
      resolveThread: (req) => call(CHANNELS.forgeResolveThread, req),
      pullReview: (req) => call(CHANNELS.forgePullReview, req),
      pullComment: (req) => call(CHANNELS.forgePullComment, req),
      pullMerge: (req) => call(CHANNELS.forgePullMerge, req),
      pullRequestReview: (req) => call(CHANNELS.forgePullRequestReview, req),
      pullReady: (req) => call(CHANNELS.forgePullReady, req),
      runRerun: (req) => call(CHANNELS.forgeRunRerun, req),
      subscribe: (req) => send(CHANNELS.forgeSubscribe, req),
      unsubscribe: (req) => send(CHANNELS.forgeUnsubscribe, req),
      onChanged: (handler) => subscribe(EVENT_CHANNELS.forgeChanged, handler),
    },
    forgeProject: {
      list: (req) => call(CHANNELS.forgeProjectList, req),
      fields: (req) => call(CHANNELS.forgeProjectFields, req),
      items: (req) => call(CHANNELS.forgeProjectItems, req),
      setField: (req) => call(CHANNELS.forgeProjectSetField, req),
      addItem: (req) => call(CHANNELS.forgeProjectAddItem, req),
      clearField: (req) => call(CHANNELS.forgeProjectClearField, req),
      create: (req) => call(CHANNELS.forgeProjectCreate, req),
      edit: (req) => call(CHANNELS.forgeProjectEdit, req),
      delete: (req) => call(CHANNELS.forgeProjectDelete, req),
      addDraftItem: (req) => call(CHANNELS.forgeProjectAddDraftItem, req),
      removeItem: (req) => call(CHANNELS.forgeProjectRemoveItem, req),
    },
    forgeAccounts: {
      list: (req) => call(CHANNELS.forgeAccounts, req),
      add: (req) => call(CHANNELS.forgeAccountAdd, req),
      remove: (req) => call(CHANNELS.forgeAccountRemove, req),
      switch: (req) => call(CHANNELS.forgeAccountSwitch, req),
      capabilities: (req) => call(CHANNELS.forgeCapabilities, req),
      reachableRepos: (req) => call(CHANNELS.forgeAccountReachableRepos, req),
    },
    tests: {
      discover: (req) => call(CHANNELS.testsDiscover, req),
      trustStatus: (req) => call(CHANNELS.testsTrustStatus, req),
      trust: (req) => call(CHANNELS.testsTrust, req),
      untrust: (req) => call(CHANNELS.testsUntrust, req),
      run: (req) => call(CHANNELS.testsRun, req),
      cancel: (req) => send(CHANNELS.testsCancel, req),
      onOutput: (handler) => subscribe(EVENT_CHANNELS.testsOutput, handler),
      onResult: (handler) => subscribe(EVENT_CHANNELS.testsResult, handler),
    },
    remotes: { list: (req) => call(CHANNELS.remotesList, req) },
    repos: {
      list: () => call(CHANNELS.repoList),
      pickDirectory: () => call(CHANNELS.repoPickDirectory),
      open: (req) => call(CHANNELS.repoOpen, req),
      close: (req) => call(CHANNELS.repoClose, req),
    },
  };
}
