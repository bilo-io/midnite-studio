import { homedir, hostname } from 'node:os';

import { contextBridge, ipcRenderer } from 'electron';

import {
  APP_VERSION_ARG,
  CHANNELS,
  EVENT_CHANNELS,
  MSTUDIO_PERF_MARK,
  WINDOW_FRAMELESS_ARG,
  perfEnabled,
  type DesktopPlatform,
  type MidniteStudioBridge,
  type Unsubscribe,
  type WindowChromeBridge,
} from '@midnite/studio-shared';

/**
 * The preload: the entire surface the renderer can see.
 *
 * Two rules hold everything else together.
 *
 * 1. **Every subscription returns an unsubscribe.** React StrictMode
 *    double-mounts every effect in development; without a teardown the second
 *    mount adds a duplicate `ipcRenderer.on` listener and every pty byte
 *    arrives twice, every watch event triggers two refetches. The bug then
 *    disappears in production, which is the worst possible failure mode.
 *
 * 2. **The exposed object is typed as `MidniteStudioBridge`.** `exposeInMainWorld`
 *    types its API parameter as `any`, so an inline literal is structurally
 *    unchecked: misspell a method and typecheck, the main-process tests and the
 *    renderer's own types all stay green while the call is `undefined` at
 *    runtime. Annotating the const is what makes the contract load-bearing.
 */

/** Typed `invoke` wrapper — one place where the `unknown` from IPC is narrowed. */
const call = <Req, Res>(channel: string, req?: Req): Promise<Res> =>
  ipcRenderer.invoke(channel, req) as Promise<Res>;

/** Subscribe to a main→renderer channel, returning the teardown. */
function subscribe<T>(channel: string, handler: (payload: T) => void): Unsubscribe {
  const listener = (_event: unknown, payload: T): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

// Single-sourced from the main process's window options — never re-derived from
// `process.platform` here (see WINDOW_FRAMELESS_ARG).
const framelessArg = process.argv.find((a) => a.startsWith(WINDOW_FRAMELESS_ARG));
const frameless = framelessArg?.slice(WINDOW_FRAMELESS_ARG.length) === '1';

// Same route, same reason: only main can ask Electron for the packaged app's
// version, and the renderer's own package.json is a different fact that happens
// to agree (see APP_VERSION_ARG). `0.0.0` when the switch is absent — which
// compares as "behind everything", so nothing mistakes a missing value for a
// current one.
const versionArg = process.argv.find((a) => a.startsWith(APP_VERSION_ARG));
const appVersion = versionArg?.slice(APP_VERSION_ARG.length) || '0.0.0';

/**
 * The `@bilo-io/shell` WindowChromeBridge implementation backing <TitleBar>.
 *
 * Fullscreen and focus are derived from one `window:state-changed` push rather
 * than three channels: the window emits them together and a single payload
 * keeps them from arriving out of order.
 */
const windowChrome: WindowChromeBridge = {
  platform: process.platform as DesktopPlatform,
  frameless,
  onFullscreenChange: (handler) =>
    subscribe<{ fullScreen: boolean }>(EVENT_CHANNELS.windowStateChanged, (state) =>
      handler(state.fullScreen),
    ),
  onFocusChange: (handler) =>
    subscribe<{ focused: boolean }>(EVENT_CHANNELS.windowStateChanged, (state) =>
      handler(state.focused),
    ),
  setBackgroundColor: (color) => {
    ipcRenderer.send(CHANNELS.windowSetBackground, color);
  },
};

/**
 * The exposed surface, group by group, as each phase's handlers land. Typed as a
 * `Pick` so a group can't be half-wired: naming it here without implementing
 * every method in it is a compile error, rather than an `undefined` the renderer
 * only discovers at the moment of the call.
 */
const bridge: Pick<
  MidniteStudioBridge,
  | 'homeDir'
  | 'hostname'
  | 'appVersion'
  | 'repos'
  | 'log'
  | 'search'
  | 'blame'
  | 'rebase'
  | 'status'
  | 'remotes'

  | 'forge'
  | 'forgeProject'
  | 'shell'
  | 'clipboard'
  | 'ops'
  | 'stash'
  | 'pty'
  | 'terminal'
  | 'browser'
  | 'agent'
  | 'council'
  | 'loopRuns'
  | 'workflow'
  | 'demoApi'
  | 'video'
  | 'fs'
  | 'stats'
  | 'diag'
  | 'scaffold'
  | 'tests'
  | 'metrics'
  | 'perf'
  | 'watch'
  | 'window'
  | 'windowChrome'
  | 'menu'
  | 'cli'
  | 'update'
  | 'systemHealth'
  | 'protocol'
> = {
  /*
    A plain value, not a channel: it never changes for the life of the process,
    and the terminal header needs it during its first render to `~`-collapse a
    path. An async fetch would paint the raw path and then rewrite it.
  */
  homeDir: homedir(),
  hostname: hostname(),
  appVersion,

  repos: {
    open: (req) => call(CHANNELS.repoOpen, req),
    list: () => call(CHANNELS.repoList),
    close: (req) => call(CHANNELS.repoClose, req),
    refs: (req) => call(CHANNELS.repoRefs, req),
    worktrees: (req) => call(CHANNELS.repoWorktrees, req),
    worktreeAdd: (req) => call(CHANNELS.repoWorktreeAdd, req),
    worktreeRemove: (req) => call(CHANNELS.repoWorktreeRemove, req),
    pickDirectory: () => call(CHANNELS.repoPickDirectory),
    revParse: (req) => call(CHANNELS.repoRevParse, req),
    reorder: (req) => ipcRenderer.send(CHANNELS.repoReorder, req),
  },
  log: {
    start: (req) => call(CHANNELS.logStart, req),
    cancel: (req) => call(CHANNELS.logCancel, req),
    onBatch: (handler) => subscribe(EVENT_CHANNELS.logBatch, handler),
    onDone: (handler) => subscribe(EVENT_CHANNELS.logDone, handler),
  },
  search: {
    start: (req) => call(CHANNELS.searchStart, req),
    cancel: (req) => call(CHANNELS.searchCancel, req),
    onBatch: (handler) => subscribe(EVENT_CHANNELS.searchBatch, handler),
    onDone: (handler) => subscribe(EVENT_CHANNELS.searchDone, handler),
  },
  blame: {
    read: (req) => call(CHANNELS.blameRead, req),
  },
  rebase: {
    start: (req) => call(CHANNELS.rebaseStart, req),
    continue: (req) => call(CHANNELS.rebaseContinue, req),
    abort: (req) => call(CHANNELS.rebaseAbort, req),
    skip: (req) => call(CHANNELS.rebaseSkip, req),
    status: (req) => call(CHANNELS.rebaseStatus, req),
  },
  status: {

    get: (req) => call(CHANNELS.statusGet, req),
    counts: (req) => call(CHANNELS.statusCounts, req),
    commitDetail: (req) => call(CHANNELS.commitDetail, req),
    fileDiff: (req) => call(CHANNELS.fileDiff, req),
    commitFileDiff: (req) => call(CHANNELS.commitFileDiff, req),
    conflictRegions: (req) => call(CHANNELS.conflictRegions, req),
  },
  remotes: {
    list: (req) => call(CHANNELS.remotesList, req),
  },
  forge: {
    cliStatus: () => call(CHANNELS.forgeCliStatus),
    runs: (req) => call(CHANNELS.forgeRuns, req),
    pulls: (req) => call(CHANNELS.forgePulls, req),
    issues: (req) => call(CHANNELS.forgeIssues, req),
    issueDetail: (req) => call(CHANNELS.forgeIssueDetail, req),
    issueComments: (req) => call(CHANNELS.forgeIssueComments, req),
    issueComment: (req) => call(CHANNELS.forgeIssueComment, req),
    issueSetState: (req) => call(CHANNELS.forgeIssueSetState, req),
    runDetail: (req) => call(CHANNELS.forgeRunDetail, req),
    runLog: (req) => call(CHANNELS.forgeRunLog, req),
    workflows: (req) => call(CHANNELS.forgeWorkflows, req),
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
  },
  forgeProject: {
    list: (req) => call(CHANNELS.forgeProjectList, req),
    fields: (req) => call(CHANNELS.forgeProjectFields, req),
    items: (req) => call(CHANNELS.forgeProjectItems, req),
    // No main handler exists for either yet — Theme E (`gh-project-write.ts`)
    // is what answers them. Wired here anyway because the bridge type (Theme
    // A) mandates the whole group; calling one before Theme E lands rejects
    // with "no handler registered", same as any other unimplemented channel.
    setField: (req) => call(CHANNELS.forgeProjectSetField, req),
    addItem: (req) => call(CHANNELS.forgeProjectAddItem, req),
    clearField: (req) => call(CHANNELS.forgeProjectClearField, req),
  },
  shell: {
    // `invoke`, not `send`: the renderer needs to know a URL was refused, and
    // a one-way send would make a blocked link indistinguishable from a slow one.
    openExternal: (req) => call(CHANNELS.shellOpenExternal, req),
    showItemInFolder: (req) => call(CHANNELS.shellShowItemInFolder, req),
  },
  clipboard: {
    // Also `invoke`: the copy button's checkmark is a claim that the text is on
    // the clipboard, and a one-way send would make that claim unverifiable.
    writeText: (req) => call(CHANNELS.clipboardWriteText, req),
  },
  ops: {
    checkout: (req) => call(CHANNELS.opCheckout, req),
    branchCreate: (req) => call(CHANNELS.opBranchCreate, req),
    branchDelete: (req) => call(CHANNELS.opBranchDelete, req),
    branchRename: (req) => call(CHANNELS.opBranchRename, req),
    tagCreate: (req) => call(CHANNELS.opTagCreate, req),
    merge: (req) => call(CHANNELS.opMerge, req),
    rebase: (req) => call(CHANNELS.opRebase, req),
    cherryPick: (req) => call(CHANNELS.opCherryPick, req),
    reset: (req) => call(CHANNELS.opReset, req),
    stage: (req) => call(CHANNELS.opStage, req),
    unstage: (req) => call(CHANNELS.opUnstage, req),
    discard: (req) => call(CHANNELS.opDiscard, req),
    conflictResolveWholeFile: (req) => call(CHANNELS.opConflictResolveWholeFile, req),
    conflictApplyHunk: (req) => call(CHANNELS.opConflictApplyHunk, req),
    commit: (req) => call(CHANNELS.opCommit, req),
    fetch: (req) => call(CHANNELS.opFetch, req),
    pull: (req) => call(CHANNELS.opPull, req),
    push: (req) => call(CHANNELS.opPush, req),
    abort: (req) => call(CHANNELS.opAbort, req),
    continue: (req) => call(CHANNELS.opContinue, req),
    blastRadius: (req) => call(CHANNELS.opBlastRadius, req),
  },
  stash: {
    list: (req) => call(CHANNELS.stashList, req),
    push: (req) => call(CHANNELS.opStashPush, req),
    pop: (req) => call(CHANNELS.opStashPop, req),
    apply: (req) => call(CHANNELS.opStashApply, req),
    drop: (req) => call(CHANNELS.opStashDrop, req),
    branch: (req) => call(CHANNELS.opStashBranch, req),
    store: (req) => call(CHANNELS.opStashStore, req),
    detail: (req) => call(CHANNELS.stashDetail, req),
    diff: (req) => call(CHANNELS.stashDiff, req),
  },
  pty: {
    create: (req) => call(CHANNELS.ptyCreate, req),
    // One-way sends: these fire per keystroke and per resize frame, and a
    // round-trip would add latency to typing for nothing to report back.
    input: (req) => ipcRenderer.send(CHANNELS.ptyInput, req),
    resize: (req) => ipcRenderer.send(CHANNELS.ptyResize, req),
    kill: (req) => ipcRenderer.send(CHANNELS.ptyKill, req),
    snapshot: (req) => call(CHANNELS.ptySnapshot, req),
    onData: (handler) => subscribe(EVENT_CHANNELS.ptyData, handler),
    onExit: (handler) => subscribe(EVENT_CHANNELS.ptyExit, handler),
    onAgentChanged: (handler) => subscribe(EVENT_CHANNELS.ptyAgentChanged, handler),
    onCommandChanged: (handler) => subscribe(EVENT_CHANNELS.ptyCommandChanged, handler),
    onActivity: (handler) => subscribe(EVENT_CHANNELS.ptyActivity, handler),
  },
  terminal: {
    list: () => call(CHANNELS.terminalList),
    // Bookkeeping, so one-way: a dropped save costs an ordering or a title, and
    // the next change rewrites the whole list regardless.
    save: (req) => ipcRenderer.send(CHANNELS.terminalSave, req),
    forget: (req) => ipcRenderer.send(CHANNELS.terminalForget, req),
    reorder: (req) => ipcRenderer.send(CHANNELS.terminalReorder, req),
  },
  browser: {
    create: (req) => call(CHANNELS.browserCreate, req),
    close: (req) => ipcRenderer.send(CHANNELS.browserClose, req),
    navigate: (req) => ipcRenderer.send(CHANNELS.browserNavigate, req),
    back: (req) => ipcRenderer.send(CHANNELS.browserBack, req),
    forward: (req) => ipcRenderer.send(CHANNELS.browserForward, req),
    reload: (req) => ipcRenderer.send(CHANNELS.browserReload, req),
    stop: (req) => ipcRenderer.send(CHANNELS.browserStop, req),
    // Fires per resize frame — a round-trip would add latency for nothing to
    // report back, matching `pty.resize`.
    setBounds: (req) => ipcRenderer.send(CHANNELS.browserSetBounds, req),
    setVisible: (req) => ipcRenderer.send(CHANNELS.browserSetVisible, req),
    activate: (req) => ipcRenderer.send(CHANNELS.browserActivate, req),
    devtools: (req) => ipcRenderer.send(CHANNELS.browserDevtools, req),
    find: (req) => ipcRenderer.send(CHANNELS.browserFind, req),
    findStop: (req) => ipcRenderer.send(CHANNELS.browserFindStop, req),
    clearData: () => call(CHANNELS.browserClearData),
    onEvent: (handler) => subscribe(EVENT_CHANNELS.browserEvent, handler),
  },
  agent: {
    list: () => call(CHANNELS.agentList),
    claudeInfo: () => call(CHANNELS.agentClaudeInfo),
    claudeUpdate: () => call(CHANNELS.agentClaudeUpdate),
    onClaudeUpdateData: (handler) => subscribe(EVENT_CHANNELS.agentClaudeUpdateData, handler),
  },
  council: {
    list: () => call(CHANNELS.councilList),
    get: (req) => call(CHANNELS.councilGet, req),
    create: (req) => call(CHANNELS.councilCreate, req),
    updateMembers: (req) => call(CHANNELS.councilUpdateMembers, req),
    remove: (req) => call(CHANNELS.councilRemove, req),
    run: {
      start: (req) => call(CHANNELS.councilRunStart, req),
      get: (req) => call(CHANNELS.councilRunGet, req),
      list: (req) => call(CHANNELS.councilRunListForCouncil, req),
      skipMember: (req) => call(CHANNELS.councilRunSkipMember, req),
      retryMember: (req) => call(CHANNELS.councilRunRetryMember, req),
    },
  },
  workflow: {
    list: () => call(CHANNELS.workflowList),
    save: (req) => call(CHANNELS.workflowSave, req),
    delete: (req) => call(CHANNELS.workflowDelete, req),
    run: (req) => call(CHANNELS.workflowRun, req),
    cancel: (req) => call(CHANNELS.workflowCancel, req),
    runs: {
      list: (req) => call(CHANNELS.workflowRunsList, req),
      get: (req) => call(CHANNELS.workflowRunsGet, req),
    },
    onRunChanged: (handler) => subscribe(EVENT_CHANNELS.workflowRunChanged, handler),
    setDefaults: (req) => ipcRenderer.send(CHANNELS.workflowSetDefaults, req),
  },
  demoApi: {
    start: () => call(CHANNELS.demoApiStart),
    stop: () => call(CHANNELS.demoApiStop),
    status: () => call(CHANNELS.demoApiStatus),
  },
  video: {
    project: {
      list: () => call(CHANNELS.videoProjectList),
      get: (req) => call(CHANNELS.videoProjectGet, req),
      create: (req) => call(CHANNELS.videoProjectCreate, req),
      remove: (req) => call(CHANNELS.videoProjectRemove, req),
    },
    studio: {
      start: (req) => call(CHANNELS.videoStudioStart, req),
      stop: (req) => call(CHANNELS.videoStudioStop, req),
      status: (req) => call(CHANNELS.videoStudioStatus, req),
    },
    render: {
      start: (req) => call(CHANNELS.videoRenderStart, req),
      cancel: (req) => call(CHANNELS.videoRenderCancel, req),
      list: (req) => call(CHANNELS.videoRenderList, req),
    },
    toolchain: (req) => call(CHANNELS.videoToolchain, req),
    files: (req) => call(CHANNELS.videoProjectFiles, req),
    onStudioChanged: (handler) => subscribe(EVENT_CHANNELS.videoStudioChanged, handler),
    onRenderProgress: (handler) => subscribe(EVENT_CHANNELS.videoRenderProgress, handler),
  },
  loopRuns: {
    list: () => call(CHANNELS.loopRunsList),
    start: (req) => call(CHANNELS.loopRunsStart, req),
    stop: (req) => call(CHANNELS.loopRunsStop, req),
    onChanged: (handler) => subscribe(EVENT_CHANNELS.loopRunsChanged, handler),
  },
  fs: {
    listDir: (req) => call(CHANNELS.fsListDir, req),
    readFile: (req) => call(CHANNELS.fsReadFile, req),
    writeFile: (req) => call(CHANNELS.fsWriteFile, req),
    create: (req) => call(CHANNELS.fsCreate, req),
    rename: (req) => call(CHANNELS.fsRename, req),
    delete: (req) => call(CHANNELS.fsDelete, req),
    dirStats: (req) => call(CHANNELS.fsDirStats, req),
    search: (req) => call(CHANNELS.fsSearch, req),
    listFiles: (req) => call(CHANNELS.fsListFiles, req),
  },
  metrics: {
    // `send`, not `invoke`, like `pty.input`: neither verb has an answer worth
    // waiting for, and `start` is re-sent on every cadence change — a
    // round-trip per flyout open would buy nothing.
    start: (req) => ipcRenderer.send(CHANNELS.metricsStart, req),
    stop: () => ipcRenderer.send(CHANNELS.metricsStop),
    onSample: (handler) => subscribe(EVENT_CHANNELS.metricsSample, handler),
  },
  diag: {
    // All `invoke`. Unlike `metrics`, every verb here has an answer the caller
    // cannot proceed without: whether the grant still applies, what may be
    // proposed, what the linter said.
    trustStatus: (req) => call(CHANNELS.diagTrustStatus, req),
    trust: (req) => call(CHANNELS.diagTrust, req),
    untrust: (req) => call(CHANNELS.diagUntrust, req),
    detect: (req) => call(CHANNELS.diagDetect, req),
    run: (req) => call(CHANNELS.diagRun, req),
  },
  scaffold: {
    plan: (req) => call(CHANNELS.scaffoldPlan, req),
    apply: (req) => call(CHANNELS.scaffoldApply, req),
  },
  stats: {
    summary: (req) => call(CHANNELS.statsSummary, req),
  },
  tests: {
    discover: (req) => call(CHANNELS.testsDiscover, req),
    trustStatus: (req) => call(CHANNELS.testsTrustStatus, req),
    trust: (req) => call(CHANNELS.testsTrust, req),
    untrust: (req) => call(CHANNELS.testsUntrust, req),
    run: (req) => call(CHANNELS.testsRun, req),
    cancel: (req) => ipcRenderer.send(CHANNELS.testsCancel, req),
    onOutput: (handler) => subscribe(EVENT_CHANNELS.testsOutput, handler),
    onResult: (handler) => subscribe(EVENT_CHANNELS.testsResult, handler),
  },
  watch: {
    onEvent: (handler) => subscribe(EVENT_CHANNELS.watchEvent, handler),
  },
  window: {
    minimize: () => ipcRenderer.send(CHANNELS.windowMinimize),
    toggleMaximize: () => ipcRenderer.send(CHANNELS.windowMaximizeToggle),
    close: () => ipcRenderer.send(CHANNELS.windowClose),
    getState: () => ipcRenderer.invoke(CHANNELS.windowState),
    onStateChange: (handler) => subscribe(EVENT_CHANNELS.windowStateChanged, handler),
    reload: (hard) => ipcRenderer.send(CHANNELS.windowReload, hard),
  },
  menu: {
    onCommand: (handler) => subscribe(EVENT_CHANNELS.menuCommand, handler),
  },
  cli: {
    status: () => call(CHANNELS.cliStatus),
    install: (req) => call(CHANNELS.cliInstall, req),
    uninstall: () => call(CHANNELS.cliUninstall),
  },
  update: {
    check: () => ipcRenderer.send(CHANNELS.updateCheck),
    download: () => ipcRenderer.send(CHANNELS.updateDownload),
    restart: () => ipcRenderer.send(CHANNELS.updateRestart),
    setChannel: (req) => ipcRenderer.send(CHANNELS.updateSetChannel, req),
    onState: (handler) => subscribe(EVENT_CHANNELS.updateState, handler),
    releaseNotes: (req) => call(CHANNELS.updateReleaseNotes, req),
  },
  perf: {
    // Read once, here: the preload is the last place in the renderer's own
    // process tree where `process.env` exists. Everything downstream reads this
    // boolean, so an unset flag makes every mark site a single false check.
    enabled: perfEnabled(process.env),
    mark: (m) => ipcRenderer.send(MSTUDIO_PERF_MARK, m),
  },
  systemHealth: () => call(CHANNELS.systemHealth),
  protocol: {
    onDeepLink: (handler) => subscribe(EVENT_CHANNELS.deepLink, handler),
  },
  windowChrome,
};

try {
  contextBridge.exposeInMainWorld('midniteStudio', bridge);
} catch {
  // contextIsolation disabled, or already exposed — nothing to do.
}
