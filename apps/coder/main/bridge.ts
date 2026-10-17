import { createBridgeSlice, type RendererIpc } from '@midnite/studio-runtime/app-main/bridge-slice';
import type { MidniteStudioBridge } from '@midnite/studio-shared';
import { CHANNELS, EVENT_CHANNELS } from '@midnite/studio-shared/ipc/channels';

/**
 * The slice of `window.midniteStudio` Coder exposes — exactly what the forge, tests, API client and
 * Database features' renderers, the frame's git graph and diff, and Coder's repository list call, and
 * nothing else: `forge.*`, `forgeProject.*`, `forgeAccounts.*` (records with a `hasToken` boolean, never
 * a token), `tests.*`, `apiClient.*`, `db.*` (connection metadata — a password goes in on a save and
 * nothing answers one), `remotes.list`, five `repos` members, the `log` stream and four read-only
 * `status` reads, plus the Sessions tab's `terminal.list`, an attach-only `pty` (snapshot, stream,
 * input, resize — no `create`, no `kill`) and the Tasks card's agent-run `handoff` (`open` a
 * `midnite://open` link, ask `runReceiver`). There is no `secrets`, `fs` or `ops` namespace: a forge token
 * or a database password is read in main only, and nothing here can write to a checkout
 * (`bridge.test.ts` holds the list). The API client writes only its own `.midnite/api/` files, in main, confined to a checkout
 * Coder's list holds.
 */
export type CoderBridge = {
  forge: MidniteStudioBridge['forge'];
  forgeProject: MidniteStudioBridge['forgeProject'];
  forgeAccounts: MidniteStudioBridge['forgeAccounts'];
  tests: MidniteStudioBridge['tests'];
  /** The API client's collections, environments, history, sends, runs and scripts (slice 3). */
  apiClient: MidniteStudioBridge['apiClient'];
  /** The Database tool's connections (metadata only — a save carries a password in, nothing returns one), schema and query stream (slice 3). */
  db: MidniteStudioBridge['db'];
  remotes: MidniteStudioBridge['remotes'];
  repos: Pick<MidniteStudioBridge['repos'], 'list' | 'pickDirectory' | 'open' | 'close' | 'refs'>;
  /** The git graph's log stream — rows laid out in main (`main/git.ts`). */
  log: MidniteStudioBridge['log'];
  /** Read-only: HEAD and the working copy, one commit, its file diffs and diff stats. */
  status: Pick<MidniteStudioBridge['status'], 'get' | 'commitDetail' | 'commitFileDiff' | 'commitStats'>;
  /** Sessions (slice 4): the runtime host's terminal sessions, listed — no save, forget or reorder. */
  terminal: Pick<MidniteStudioBridge['terminal'], 'list'>;
  /** Attach to one: snapshot, stream, type and resize. No `create` and no `kill` — Coder starts nothing. */
  pty: Pick<MidniteStudioBridge['pty'], 'snapshot' | 'input' | 'resize' | 'subscribe' | 'unsubscribe' | 'onData' | 'onExit'>;
  /**
   * The agent-run hand-off (slice 5): who can receive a run (a name, or null) and open the
   * `midnite://open` link main re-parses before it opens anything. A task card's Play is this.
   */
  handoff: { open: NonNullable<MidniteStudioBridge['handoff']>['open']; runReceiver: NonNullable<NonNullable<MidniteStudioBridge['handoff']>['runReceiver']> };
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
    apiClient: {
      listCollections: (req) => call(CHANNELS.apiListCollections, req),
      readCollection: (req) => call(CHANNELS.apiReadCollection, req),
      saveCollection: (req) => call(CHANNELS.apiSaveCollection, req),
      importCollection: (req) => call(CHANNELS.apiImportCollection, req),
      deleteCollection: (req) => call(CHANNELS.apiDeleteCollection, req),
      exportCollection: (req) => call(CHANNELS.apiExportCollection, req),
      sendRequest: (req) => call(CHANNELS.apiSendRequest, req),
      cancelRequest: (req) => call(CHANNELS.apiCancelRequest, req),
      pickBinaryFile: () => call(CHANNELS.apiPickBinaryFile),
      listEnvironments: (req) => call(CHANNELS.apiListEnvironments, req),
      readEnvironment: (req) => call(CHANNELS.apiReadEnvironment, req),
      saveEnvironment: (req) => call(CHANNELS.apiSaveEnvironment, req),
      deleteEnvironment: (req) => call(CHANNELS.apiDeleteEnvironment, req),
      listHistory: (req) => call(CHANNELS.apiListHistory, req),
      clearHistory: (req) => call(CHANNELS.apiClearHistory, req),
      runScript: (req) => call(CHANNELS.apiRunScript, req),
      setScriptTrust: (req) => call(CHANNELS.apiSetScriptTrust, req),
      runCollection: (req) => call(CHANNELS.apiRunCollection, req),
      cancelRun: (req) => call(CHANNELS.apiCancelRun, req),
      onRunProgress: (handler) => subscribe(EVENT_CHANNELS.apiRunProgress, handler),
      onRunDone: (handler) => subscribe(EVENT_CHANNELS.apiRunDone, handler),
    },
    db: {
      listConnections: () => call(CHANNELS.dbListConnections),
      saveConnection: (req) => call(CHANNELS.dbSaveConnection, req),
      deleteConnection: (req) => call(CHANNELS.dbDeleteConnection, req),
      testConnection: (req) => call(CHANNELS.dbTestConnection, req),
      getSchema: (req) => call(CHANNELS.dbGetSchema, req),
      queryStart: (req) => call(CHANNELS.dbQueryStart, req),
      queryCancel: (req) => call(CHANNELS.dbQueryCancel, req),
      onQueryBatch: (handler) => subscribe(EVENT_CHANNELS.dbQueryBatch, handler),
      onQueryDone: (handler) => subscribe(EVENT_CHANNELS.dbQueryDone, handler),
    },
    remotes: { list: (req) => call(CHANNELS.remotesList, req) },
    repos: {
      list: () => call(CHANNELS.repoList),
      pickDirectory: () => call(CHANNELS.repoPickDirectory),
      open: (req) => call(CHANNELS.repoOpen, req),
      close: (req) => call(CHANNELS.repoClose, req),
      refs: (req) => call(CHANNELS.repoRefs, req),
    },
    log: {
      start: (req) => call(CHANNELS.logStart, req),
      cancel: (req) => call(CHANNELS.logCancel, req),
      onBatch: (handler) => subscribe(EVENT_CHANNELS.logBatch, handler),
      onDone: (handler) => subscribe(EVENT_CHANNELS.logDone, handler),
    },
    status: {
      get: (req) => call(CHANNELS.statusGet, req),
      commitDetail: (req) => call(CHANNELS.commitDetail, req),
      commitFileDiff: (req) => call(CHANNELS.commitFileDiff, req),
      commitStats: (req) => call(CHANNELS.commitStats, req),
    },
    terminal: { list: () => call(CHANNELS.terminalList) },
    pty: {
      snapshot: (req) => call(CHANNELS.ptySnapshot, req),
      input: (req) => send(CHANNELS.ptyInput, req),
      resize: (req) => send(CHANNELS.ptyResize, req),
      subscribe: (req) => send(CHANNELS.ptySubscribe, req),
      unsubscribe: (req) => send(CHANNELS.ptyUnsubscribe, req),
      onData: (handler) => subscribe(EVENT_CHANNELS.ptyData, handler),
      onExit: (handler) => subscribe(EVENT_CHANNELS.ptyExit, handler),
    },
    handoff: {
      open: (req) => call(CHANNELS.handoffOpen, req),
      runReceiver: () => call(CHANNELS.handoffRunReceiver),
    },
  };
}
