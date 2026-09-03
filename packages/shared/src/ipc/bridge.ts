import type { z } from 'zod';

import type {
  GitOpResult,
  GraphRow,
  MetricSample,
  Ref,
  ReflogEntry,
  Remote,
  RepoDescriptor,
  RepoStats,
  StashDropResult,
  StashEntry,
  StatusCounts,
  StatusResult,
  WatchEvent,
  Worktree,
} from '../domain';
import type { CommandId } from '../keybindings';
import type { PerfMark } from '../perf';
import type * as S from './schemas';

type In<T extends z.ZodTypeAny> = z.input<T>;

/**
 * Unsubscribe handle. Every subscription returns one — the renderer's effects
 * call it on cleanup, and without it a StrictMode double-mount silently
 * accumulates duplicate `ipcRenderer.on` listeners (each pty byte then arrives
 * twice, each watch event triggers two refetches).
 */
export type Unsubscribe = () => void;

/**
 * The window-chrome contract from `@bilo-io/shell`, restated structurally.
 *
 * `shared` depends on zod and nothing else (it is imported by the Electron main
 * process, which must not pull a React package into its module graph), so it
 * cannot import the type from shell. The renderer asserts the two stay
 * compatible with a compile-time check — see packages/app/src/services/ipc.
 */
export type DesktopPlatform = 'darwin' | 'win32' | 'linux';

export type WindowChromeBridge = {
  platform: DesktopPlatform;
  frameless: boolean;
  onFullscreenChange: (handler: (fullscreen: boolean) => void) => Unsubscribe;
  onFocusChange: (handler: (focused: boolean) => void) => Unsubscribe;
  setBackgroundColor: (color: string) => void;
};

/**
 * Everything the preload exposes on `window.midniteStudio`. This type is the
 * renderer's only view of the main process — it may not import `electron`, so
 * this is the API surface in full.
 */
export type MidniteStudioBridge = {
  /**
   * The user's home directory, as an absolute path.
   *
   * A constant for the life of the process, so it is a value rather than a
   * channel — the terminal header `~`-collapses its path on first paint, and an
   * async round-trip for a fact that never changes would show the un-collapsed
   * path first and then rewrite it.
   *
   * The renderer may not import `node:path` or `node:os` (see the package
   * boundaries in CLAUDE.md), which is the whole reason this crosses here.
   */
  homeDir: string;

  /**
   * This build's semantic version, as `app.getVersion()` reports it.
   *
   * A plain value for the same reason `homeDir` is one — see `APP_VERSION_ARG`,
   * which is how it crosses.
   */
  appVersion: string;

  /**
   * This machine's hostname, as an absolute-truth string.
   *
   * Here for the same reason as `homeDir`, and needed for a reason that is not
   * obvious: `window.location.hostname` is the *page's* host, which in this app
   * is `localhost` under the dev server and empty under `file://` in the
   * packaged build. Neither is the machine. OSC 7 payloads routinely carry the
   * real hostname — `printf '\e]7;file://%s%s\a' "$HOST" "$PWD"` is the
   * canonical emitter — so a cwd parser that compared against the page's host
   * would reject every one of them.
   */
  hostname: string;

  repos: {
    open: (req: In<typeof S.RepoOpenRequest>) => Promise<z.infer<typeof S.RepoOpenResponse>>;
    list: () => Promise<RepoDescriptor[]>;
    close: (req: In<typeof S.RepoCloseRequest>) => Promise<void>;
    refs: (req: In<typeof S.RepoRefsRequest>) => Promise<Ref[]>;
    worktrees: (req: In<typeof S.RepoWorktreesRequest>) => Promise<Worktree[]>;
    worktreeAdd: (req: In<typeof S.WorktreeAddRequest>) => Promise<GitOpResult>;
    worktreeRemove: (req: In<typeof S.WorktreeRemoveRequest>) => Promise<GitOpResult>;
    /** Persist the sidebar's user-defined order. Fire-and-forget: a dropped
     *  message costs an order, not correctness. */
    reorder: (req: In<typeof S.RepoReorderRequest>) => void;
    /** Native directory picker. Resolves to null when the user cancels. */
    pickDirectory: () => Promise<string | null>;
    /**
     * Resolve an abbreviated hex revision to its full commit sha.
     *
     * Resolves `{sha: null}` for a revision this repo does not have — a commit
     * message can reference one that was never pushed, or that a rebase
     * orphaned — so the caller can say so instead of selecting a sha that will
     * never load.
     */
    revParse: (req: In<typeof S.RevParseRequest>) => Promise<z.infer<typeof S.RevParseResponse>>;
  };

  log: {
    /**
     * Start streaming laid-out graph rows. Batches arrive on `onBatch`, tagged
     * with `requestId`; the caller drops batches whose id it no longer wants.
     */
    start: (req: In<typeof S.LogStartRequest>) => Promise<void>;
    cancel: (req: In<typeof S.LogCancelRequest>) => Promise<void>;
    onBatch: (handler: (e: { requestId: string; rows: GraphRow[] }) => void) => Unsubscribe;
    onDone: (handler: (e: z.infer<typeof S.LogDoneEvent>) => void) => Unsubscribe;
  };

  search: {
    start: (
      req: In<typeof S.SearchStartRequest>,
    ) => Promise<z.infer<typeof S.SearchStartResponse>>;
    cancel: (req: In<typeof S.SearchCancelRequest>) => Promise<void>;
    onBatch: (handler: (e: z.infer<typeof S.SearchBatchEvent>) => void) => Unsubscribe;
    onDone: (handler: (e: z.infer<typeof S.SearchDoneEvent>) => void) => Unsubscribe;
  };

  blame: {
    read: (
      req: In<typeof S.BlameReadRequest>,
    ) => Promise<z.infer<typeof S.BlameReadResponse>>;
  };

  status: {

    get: (req: In<typeof S.StatusGetRequest>) => Promise<StatusResult>;
    /**
     * Per-path `+n −n` for the same checkout `get` describes.
     *
     * A path missing from either list changed by nothing on that side — the
     * caller reads absence as zero rather than as "not loaded", which is what
     * lets a row render its counts the moment status arrives.
     */
    counts: (req: In<typeof S.StatusCountsRequest>) => Promise<StatusCounts>;
    /**
     * One commit in full. Resolves `null` when the sha names no commit here —
     * which a linkified reference from a commit message legitimately can.
     */
    commitDetail: (
      req: In<typeof S.CommitDetailRequest>,
    ) => Promise<z.infer<typeof S.CommitDetailResponse> | null>;
    fileDiff: (req: In<typeof S.FileDiffRequest>) => Promise<z.infer<typeof S.FileDiffResponse>>;
    /**
     * A file's diff within a commit. Same response shape as `fileDiff` — one
     * `<DiffView>` renders both — but scoped to a sha rather than the index.
     */
    commitFileDiff: (
      req: In<typeof S.CommitFileDiffRequest>,
    ) => Promise<z.infer<typeof S.FileDiffResponse>>;
    /** A conflicted path's parsed regions — the Studio's read side (Phase 47 Theme D). */
    conflictRegions: (
      req: In<typeof S.ConflictRegionsRequest>,
    ) => Promise<z.infer<typeof S.ConflictRegionsResponse>>;
  };

  /**
   * Interactive rebase sequence planner & execution controls.
   */
  rebase: {
    start: (req: In<typeof S.RebaseStartRequest>) => Promise<GitOpResult>;
    continue: (req: In<typeof S.RebaseContinueRequest>) => Promise<GitOpResult>;
    abort: (req: In<typeof S.RebaseAbortRequest>) => Promise<GitOpResult>;
    skip: (req: In<typeof S.RebaseSkipRequest>) => Promise<GitOpResult>;
    status: (req: In<typeof S.RebaseStatusRequest>) => Promise<z.infer<typeof S.RebaseStatusResponse>>;
  };

  /**
   * Configured remotes, with each URL already normalised into a `forge`.
   *
   * Its own group rather than a member of `repos` because it is read on a
   * different cadence: `repos.refs` is re-fetched on every ref event, while
   * remotes change only when someone edits the config.
   */
  remotes: {
    list: (req: In<typeof S.RemotesListRequest>) => Promise<Remote[]>;
  };

  /**
   * GitHub, read through the user's own `gh` CLI.
   *
   * Separate from `remotes` even though it is keyed off the same `Forge`,
   * because the two have nothing in common at runtime: `remotes.list` reads
   * `.git/config` in microseconds and changes only when someone edits it,
   * while these spawn a subprocess that talks to the network. Every method
   * fails soft — a machine with no `gh`, or one that is signed out, gets a
   * `cli` reason code and an empty list, never a rejection.
   */
  forge: {
    cliStatus: () => Promise<z.infer<typeof S.ForgeCliStatusResponse>>;
    runs: (req: In<typeof S.ForgeRunsRequest>) => Promise<z.infer<typeof S.ForgeRunsResponse>>;
    pulls: (req: In<typeof S.ForgePullsRequest>) => Promise<z.infer<typeof S.ForgePullsResponse>>;
    issues: (req: In<typeof S.ForgeIssuesRequest>) => Promise<z.infer<typeof S.ForgeIssuesResponse>>;
    /** One run's job/step tree. Served from main's cache once the run is over. */
    runDetail: (
      req: In<typeof S.ForgeRunDetailRequest>,
    ) => Promise<z.infer<typeof S.ForgeRunDetailResponse>>;
    /** A capped log, unless `full` is asked for. Never a silently short one. */
    runLog: (req: In<typeof S.ForgeRunLogRequest>) => Promise<z.infer<typeof S.ForgeRunLogResponse>>;
    /** Workflow definitions, for their file paths. Lazy — see the channel doc. */
    workflows: (
      req: In<typeof S.ForgeWorkflowsRequest>,
    ) => Promise<z.infer<typeof S.ForgeWorkflowsResponse>>;
    /** One PR's metadata — fetched when a pull request is opened, never for a list. */
    pullDetail: (
      req: In<typeof S.ForgePullDetailRequest>,
    ) => Promise<z.infer<typeof S.ForgePullDetailResponse>>;
    /** One PR's diff, parsed in main and capped by bytes. */
    pullFiles: (
      req: In<typeof S.ForgePullFilesRequest>,
    ) => Promise<z.infer<typeof S.ForgePullFilesResponse>>;
    /** One PR's conversation — discussion comments and review submissions, merged. */
    pullComments: (
      req: In<typeof S.ForgePullCommentsRequest>,
    ) => Promise<z.infer<typeof S.ForgePullCommentsResponse>>;
    /** One PR's inline threads, read through GraphQL — see `ForgeReviewThread`. */
    pullThreads: (
      req: In<typeof S.ForgePullThreadsRequest>,
    ) => Promise<z.infer<typeof S.ForgePullThreadsResponse>>;

    /*
      The three writes (Phase 20 Theme E), and the only ones on this bridge.

      They resolve `ForgeWriteResult` rather than rejecting, exactly as the
      reads resolve an envelope: a refused approve belongs beside the button
      that asked for it, not in an unhandled rejection that takes the composer
      and its unsent text with it.
    */
    /** Start a new inline thread on a line of the PR's diff. */
    reviewComment: (
      req: In<typeof S.ForgeReviewCommentRequest>,
    ) => Promise<z.infer<typeof S.ForgeReviewCommentResponse>>;
    /** Reply into an existing inline thread. */
    reviewReply: (
      req: In<typeof S.ForgeReviewReplyRequest>,
    ) => Promise<z.infer<typeof S.ForgeReviewReplyResponse>>;
    /** Mark an inline thread resolved, or reopen it. */
    resolveThread: (
      req: In<typeof S.ForgeResolveThreadRequest>,
    ) => Promise<z.infer<typeof S.ForgeResolveThreadResponse>>;
    /*
      Themes F and G — the verdict, the merge, and the three nudges.

      All six answer `ForgeWriteResult` rather than throwing, so a refused
      approve is a sentence the composer renders beside itself with the typed
      body still in it. See the domain schema's own note.
    */
    /** Approve, request changes, or comment — the verb rides in `event`. */
    pullReview: (
      req: In<typeof S.ForgePullReviewRequest>,
    ) => Promise<z.infer<typeof S.ForgePullReviewResponse>>;
    /** A discussion comment, not a verdict-less review. See the channel doc. */
    pullComment: (
      req: In<typeof S.ForgePullCommentRequest>,
    ) => Promise<z.infer<typeof S.ForgePullCommentResponse>>;
    /** Merge. Confirmed in the renderer before it is ever reached. */
    pullMerge: (
      req: In<typeof S.ForgePullMergeRequest>,
    ) => Promise<z.infer<typeof S.ForgePullMergeResponse>>;
    /** Ask logins for a review — the same call re-asks an existing request. */
    pullRequestReview: (
      req: In<typeof S.ForgePullRequestReviewRequest>,
    ) => Promise<z.infer<typeof S.ForgePullRequestReviewResponse>>;
    /** Draft → ready. One-directional; there is no un-ready here. */
    pullReady: (
      req: In<typeof S.ForgePullReadyRequest>,
    ) => Promise<z.infer<typeof S.ForgePullReadyResponse>>;
    /** Re-run a workflow run, or only its failed jobs. */
    runRerun: (
      req: In<typeof S.ForgeRunRerunRequest>,
    ) => Promise<z.infer<typeof S.ForgeRunRerunResponse>>;
  };

  /**
   * GitHub ProjectV2 (Phase 40 Theme A), read through the same `gh` CLI
   * escape hatch as `forge` above and kept as its own group for the same
   * reason it is its own IPC namespace: ProjectV2 is GraphQL-only, served by
   * its own main-side module (`gh-project.ts`), and carries its own narrow
   * write surface — one field value, one item add, nothing else.
   *
   * `setField` and `addItem` resolve `ForgeProjectWriteResult` rather than
   * `ForgeWriteResult`: a missing `project` OAuth scope is a normal outcome
   * this app expects the first time a user opens the view, not a fault, and
   * the envelope's `kind: 'insufficient-scope'` arm is what lets the table
   * render the exact `gh auth refresh -s project` fix in place of the cell
   * that failed to write, rather than a generic error toast.
   */
  forgeProject: {
    /** The ProjectV2 boards visible to the open repo's owner. */
    list: (
      req: In<typeof S.ForgeProjectListRequest>,
    ) => Promise<z.infer<typeof S.ForgeProjectListResponse>>;
    /** One board's field definitions, for the table's columns. */
    fields: (
      req: In<typeof S.ForgeProjectFieldsRequest>,
    ) => Promise<z.infer<typeof S.ForgeProjectFieldsResponse>>;
    /** One board's items, one page at a time — see `nextCursor` on the result. */
    items: (
      req: In<typeof S.ForgeProjectItemsRequest>,
    ) => Promise<z.infer<typeof S.ForgeProjectItemsResponse>>;
    /** `updateProjectV2ItemFieldValue` — the one per-cell write this phase allows. */
    setField: (
      req: In<typeof S.ForgeProjectSetFieldRequest>,
    ) => Promise<z.infer<typeof S.ForgeProjectSetFieldResponse>>;
    /** `addProjectV2ItemById` — attach an existing issue or PR to the board. */
    addItem: (
      req: In<typeof S.ForgeProjectAddItemRequest>,
    ) => Promise<z.infer<typeof S.ForgeProjectAddItemResponse>>;
    /** `clearProjectV2ItemFieldValue` — empty a cell, e.g. dropping a card on "No status". */
    clearField: (
      req: In<typeof S.ForgeProjectClearFieldRequest>,
    ) => Promise<z.infer<typeof S.ForgeProjectClearFieldResponse>>;
  };

  /**
   * Hand-offs to the OS.
   *
   * `openExternal` is protocol-restricted in the schema AND re-checked in the
   * handler — see OPEN_EXTERNAL_PROTOCOLS. Resolves `{ok:false}` on a refused
   * URL rather than rejecting, so a bad link in a commit message is a no-op
   * rather than an unhandled rejection in the renderer. `showItemInFolder` is
   * the other hand-off (Phase 24): repo-scoped rather than protocol-scoped,
   * so the jail is `FsRepoScope` plus `fs-scope.ts`'s `confineToRoot` instead
   * of a URL allowlist.
   */
  shell: {
    openExternal: (
      req: In<typeof S.OpenExternalRequest>,
    ) => Promise<z.infer<typeof S.OpenExternalResponse>>;
    /** Reveal a file or folder in the OS file manager (Finder). */
    showItemInFolder: (
      req: In<typeof S.ShowItemInFolderRequest>,
    ) => Promise<z.infer<typeof S.ShowItemInFolderResponse>>;
  };

  /**
   * The system clipboard, write-only.
   *
   * Read is deliberately absent: nothing in the app pastes, and exposing
   * `readText` would let renderer code observe whatever the user last copied
   * anywhere on their machine.
   *
   * Routed through main rather than `navigator.clipboard` because the packaged
   * app is a `file://` origin — see CHANNELS.clipboardWriteText.
   */
  clipboard: {
    writeText: (
      req: In<typeof S.ClipboardWriteTextRequest>,
    ) => Promise<z.infer<typeof S.ClipboardWriteTextResponse>>;
  };

  /** Mutating operations. None of these reject — they resolve to a GitOpResult. */
  ops: {
    checkout: (req: In<typeof S.CheckoutRequest>) => Promise<GitOpResult>;
    branchCreate: (req: In<typeof S.BranchCreateRequest>) => Promise<GitOpResult>;
    branchDelete: (req: In<typeof S.BranchDeleteRequest>) => Promise<GitOpResult>;
    branchRename: (req: In<typeof S.BranchRenameRequest>) => Promise<GitOpResult>;
    tagCreate: (req: In<typeof S.TagCreateRequest>) => Promise<GitOpResult>;
    merge: (req: In<typeof S.MergeRequest>) => Promise<GitOpResult>;
    rebase: (req: In<typeof S.RebaseRequest>) => Promise<GitOpResult>;
    cherryPick: (req: In<typeof S.CherryPickRequest>) => Promise<GitOpResult>;
    reset: (req: In<typeof S.ResetRequest>) => Promise<GitOpResult>;
    stage: (req: In<typeof S.StageRequest>) => Promise<GitOpResult>;
    unstage: (req: In<typeof S.UnstageRequest>) => Promise<GitOpResult>;
    discard: (req: In<typeof S.DiscardRequest>) => Promise<GitOpResult>;
    conflictResolveWholeFile: (
      req: In<typeof S.ConflictResolveWholeFileRequest>,
    ) => Promise<GitOpResult>;
    conflictApplyHunk: (req: In<typeof S.ApplyConflictHunkRequest>) => Promise<GitOpResult>;
    commit: (req: In<typeof S.CommitRequest>) => Promise<GitOpResult>;
    fetch: (req: In<typeof S.FetchRequest>) => Promise<GitOpResult>;
    pull: (req: In<typeof S.PullRequest>) => Promise<GitOpResult>;
    push: (req: In<typeof S.PushRequest>) => Promise<GitOpResult>;
    abort: (req: In<typeof S.AbortRequest>) => Promise<GitOpResult>;
    continue: (req: In<typeof S.ContinueRequest>) => Promise<GitOpResult>;
    blastRadius: (
      req: In<typeof S.BlastRadiusRequest>,
    ) => Promise<z.infer<typeof S.BlastRadiusResponse>>;
  };

  /** `git stash`. Read and write share one group — the domain is too small
   *  to split the way `repos`/`ops` are. */
  stash: {
    list: (req: In<typeof S.StashListRequest>) => Promise<StashEntry[]>;
    push: (req: In<typeof S.StashPushRequest>) => Promise<GitOpResult>;
    pop: (req: In<typeof S.StashPopRequest>) => Promise<GitOpResult>;
    apply: (req: In<typeof S.StashApplyRequest>) => Promise<GitOpResult>;
    /** Its own result type — a drop carries the sha it just made unreachable. */
    drop: (req: In<typeof S.StashDropRequest>) => Promise<StashDropResult>;
    branch: (req: In<typeof S.StashBranchRequest>) => Promise<GitOpResult>;
    /** Restore a dropped stash from its captured sha (Phase 22 Theme H's undo). */
    store: (req: In<typeof S.StashStoreRequest>) => Promise<GitOpResult>;
    /** A stash entry's three-part file list (Phase 22 Theme D). `null` for a stale selector. */
    detail: (
      req: In<typeof S.StashDetailRequest>,
    ) => Promise<z.infer<typeof S.StashDetailResponse>>;
    /** One file's hunks within one part of a stash entry (Phase 22 Theme D). */
    diff: (req: In<typeof S.StashDiffRequest>) => Promise<z.infer<typeof S.StashDiffResponse>>;
  };

  reflog: {
    /** Newest first — see `ReflogEntrySchema` for why `at` isn't a commit date. */
    list: (req: In<typeof S.ReflogListRequest>) => Promise<ReflogEntry[]>;
  };

  pty: {
    create: (req: In<typeof S.PtyCreateRequest>) => Promise<z.infer<typeof S.PtyCreateResponse>>;
    input: (req: In<typeof S.PtyInputRequest>) => void;
    resize: (req: In<typeof S.PtyResizeRequest>) => void;
    kill: (req: In<typeof S.PtyKillRequest>) => void;
    /** The current ring-buffer contents for a live pty — see the channel's own doc. */
    snapshot: (
      req: In<typeof S.PtySnapshotRequest>,
    ) => Promise<z.infer<typeof S.PtySnapshotResponse>>;
    /**
     * Terminal output. Bytes cross the boundary as a `Uint8Array` via structured
     * clone — no base64 round-trip (the app is in-process; only a WebSocket path
     * would need one), so xterm gets the raw bytes and multi-byte UTF-8 split
     * across chunks stays intact.
     */
    onData: (handler: (e: { ptyId: string; data: Uint8Array }) => void) => Unsubscribe;
    onExit: (handler: (e: z.infer<typeof S.PtyExitEvent>) => void) => Unsubscribe;
    /**
     * An agent started or quit inside a pty, from main's own process probe.
     *
     * Fires on a change only. `agentId: null` means main looked and recognised
     * nothing — see {@link S.PtyAgentChangedEvent} for why that is a different
     * thing from never having been told.
     */
    onAgentChanged: (
      handler: (e: z.infer<typeof S.PtyAgentChangedEvent>) => void,
    ) => Unsubscribe;
    /** The shell's foreground process changed — see the channel's own doc. */
    onCommandChanged: (
      handler: (e: z.infer<typeof S.PtyCommandChangedEvent>) => void,
    ) => Unsubscribe;
    /**
     * A live pty's guessed activity changed — see {@link S.PtyActivityEvent}.
     * Mounted per session and does not unmount with the terminal panel.
     */
    onActivity: (handler: (e: z.infer<typeof S.PtyActivityEvent>) => void) => Unsubscribe;
  };

  /**
   * The durable half of the terminal — session rows and their scrollback.
   *
   * Separate from `pty` because a session outlives every process it ever ran:
   * `list()` returns rows that have no pty at all until the user revives them.
   */
  terminal: {
    list: () => Promise<z.infer<typeof S.TerminalListResponse>>;
    save: (req: In<typeof S.TerminalSaveRequest>) => void;
    forget: (req: In<typeof S.TerminalForgetRequest>) => void;
    reorder: (req: In<typeof S.TerminalReorderRequest>) => void;
  };

  /**
   * The embedded browser engine (Phase 32) — one `WebContentsView` per tab,
   * owned by main's `browser-service.ts`. Chrome state (nav, title, favicon,
   * loading) arrives on the single `onEvent` push rather than per-kind
   * events, since the events vary in payload shape per tab rather than per
   * subsystem — see {@link S.BrowserEventPayload}.
   */
  browser: {
    create: (req: In<typeof S.BrowserCreateRequest>) => Promise<z.infer<typeof S.BrowserCreateResponse>>;
    close: (req: In<typeof S.BrowserCloseRequest>) => void;
    navigate: (req: In<typeof S.BrowserNavigateRequest>) => void;
    back: (req: In<typeof S.BrowserBackRequest>) => void;
    forward: (req: In<typeof S.BrowserForwardRequest>) => void;
    reload: (req: In<typeof S.BrowserReloadRequest>) => void;
    stop: (req: In<typeof S.BrowserStopRequest>) => void;
    setBounds: (req: In<typeof S.BrowserSetBoundsRequest>) => void;
    setVisible: (req: In<typeof S.BrowserSetVisibleRequest>) => void;
    activate: (req: In<typeof S.BrowserActivateRequest>) => void;
    devtools: (req: In<typeof S.BrowserDevtoolsRequest>) => void;
    find: (req: In<typeof S.BrowserFindRequest>) => void;
    findStop: (req: In<typeof S.BrowserFindStopRequest>) => void;
    /** Wipes the `persist:browser` partition's storage and cache. */
    clearData: () => Promise<z.infer<typeof S.BrowserClearDataResponse>>;
    onEvent: (handler: (e: z.infer<typeof S.BrowserEventPayload>) => void) => Unsubscribe;
  };

  /** Built-in agents merged with the user's `agents.json`, plus the Claude CLI. */
  agent: {
    list: () => Promise<z.infer<typeof S.AgentListResponse>>;
    /** Installed version + install method; `installed: false` when absent. */
    claudeInfo: () => Promise<z.infer<typeof S.ClaudeInfoResponse>>;
    /** Runs the update to completion; output streams on `onClaudeUpdateData`. */
    claudeUpdate: () => Promise<z.infer<typeof S.ClaudeUpdateResponse>>;
    onClaudeUpdateData: (
      handler: (e: z.infer<typeof S.ClaudeUpdateDataEvent>) => void,
    ) => Unsubscribe;
  };

  /**
   * Agent councils (Phase 34) — global, not per-repo. A member's or the
   * synthesizer's live output is read through the existing `pty.onData` /
   * `pty.onExit` / `pty.snapshot` above, filtered by the `ptyId` a running
   * `run.get` answer carries — there is no separate council event channel.
   */
  council: {
    list: () => Promise<z.infer<typeof S.CouncilListResponse>>;
    get: (req: In<typeof S.CouncilGetRequest>) => Promise<z.infer<typeof S.CouncilGetResponse>>;
    create: (
      req: In<typeof S.CouncilCreateRequest>,
    ) => Promise<z.infer<typeof S.CouncilCreateResponse>>;
    updateMembers: (
      req: In<typeof S.CouncilUpdateMembersRequest>,
    ) => Promise<z.infer<typeof S.CouncilUpdateMembersResponse>>;
    remove: (req: In<typeof S.CouncilRemoveRequest>) => Promise<GitOpResult>;
    run: {
      start: (
        req: In<typeof S.CouncilRunStartRequest>,
      ) => Promise<z.infer<typeof S.CouncilRunStartResponse>>;
      get: (req: In<typeof S.CouncilRunGetRequest>) => Promise<z.infer<typeof S.CouncilRunGetResponse>>;
      list: (
        req: In<typeof S.CouncilRunListRequest>,
      ) => Promise<z.infer<typeof S.CouncilRunListResponse>>;
      skipMember: (req: In<typeof S.CouncilRunSkipMemberRequest>) => Promise<GitOpResult>;
      retryMember: (req: In<typeof S.CouncilRunRetryMemberRequest>) => Promise<GitOpResult>;
    };
  };

  /**
   * FAB loop run history (Phase 35). `start` announces a run the renderer just
   * launched; its END belongs to main — the pty exit finalises the record, so
   * a reloaded renderer cannot lose an `endedAt`. `onChanged` carries nothing:
   * the list is capped-small, so consumers just re-fetch it.
   */
  loopRuns: {
    list: () => Promise<z.infer<typeof S.LoopRunsListResponse>>;
    start: (
      req: In<typeof S.LoopRunStartRequest>,
    ) => Promise<z.infer<typeof S.LoopRunStartResponse>>;
    stop: (req: In<typeof S.LoopRunStopRequest>) => Promise<z.infer<typeof S.LoopRunStopResponse>>;
    onChanged: (handler: () => void) => Unsubscribe;
  };

  /**
   * Filesystem browsing (Phase 16) plus writes (Phase 24). The four write
   * methods are repo scope only — `claude-home` is not expressible in their
   * request types — and every one resolves to a `GitOpResult`, never rejects.
   */
  fs: {
    listDir: (
      req: In<typeof S.FsListDirRequest>,
    ) => Promise<z.infer<typeof S.FsListDirResponse>>;
    readFile: (
      req: In<typeof S.FsReadFileRequest>,
    ) => Promise<z.infer<typeof S.FsReadFileResponse>>;
    /** Overwrite an existing file. Refuses (`code: 'stale-write'`) on a moved `FsVersion`. */
    writeFile: (req: In<typeof S.FsWriteFileRequest>) => Promise<GitOpResult>;
    create: (req: In<typeof S.FsCreateRequest>) => Promise<GitOpResult>;
    rename: (req: In<typeof S.FsRenameRequest>) => Promise<GitOpResult>;
    /** Through the OS Trash, not `unlink` — recoverable in the Finder. */
    delete: (req: In<typeof S.FsDeleteRequest>) => Promise<GitOpResult>;
    /** File count + total bytes for a directory, capped — see `FS_DIR_STATS_WALK_CAP`. */
    dirStats: (
      req: In<typeof S.FsDirStatsRequest>,
    ) => Promise<z.infer<typeof S.FsDirStatsResponse>>;
    /** `git grep` over the tracked working tree — see `FS_SEARCH_MAX_MATCHES`. */
    search: (req: In<typeof S.FsSearchRequest>) => Promise<z.infer<typeof S.FsSearchResponse>>;
    /** List tracked and untracked files via `git ls-files` (capped at 20 000) — Phase 23 Theme G. */
    listFiles: (
      req: In<typeof S.FsListFilesRequest>,
    ) => Promise<z.infer<typeof S.FsListFilesResponse>>;
  };

  /**
   * The machine's live vitals, for the footer's right cluster.
   *
   * `start`/`stop` are one-way sends with nothing to report back, and `start`
   * doubles as the cadence control: re-sending it with a different
   * `intervalMs` re-arms the existing sampler rather than adding a second one.
   * That keeps cadence a consequence of what is on screen (the flyout opening
   * escalates to 2s) instead of a separate verb the two sides must agree on.
   *
   * A sample OMITS any metric this machine cannot report. Nothing here is ever
   * zero-filled — see MetricSample.
   */
  metrics: {
    start: (req: In<typeof S.MetricsStartRequest>) => void;
    stop: () => void;
    onSample: (handler: (sample: MetricSample) => void) => Unsubscribe;
  };

  /**
   * The selected repository's own opinion of itself, from its own linter.
   *
   * The only surface in this app that executes a binary belonging to the
   * repository rather than to us, which is why it is the only one with a
   * trust verb. `run` does nothing at all until `trust` has recorded a grant
   * for the exact command it is about to spawn; an untrusted repo resolves to
   * `{ok:false, reason:'untrusted'}` rather than prompting from main, because
   * the prompt is a renderer concern and main must not be able to block on one.
   *
   * `detect` is safe to call unprompted — it reads the filesystem and executes
   * nothing. `run` never is.
   *
   * Nothing here rejects: every failure is a reason code the footer renders.
   */
  diag: {
    trustStatus: (
      req: In<typeof S.DiagTrustStatusRequest>,
    ) => Promise<z.infer<typeof S.DiagTrustStatusResponse>>;
    /** Approve the exact command the user was shown. */
    trust: (req: In<typeof S.DiagTrustRequest>) => Promise<z.infer<typeof S.DiagTrustResponse>>;
    /** Revoke the grant. The configured command is kept, so re-enabling is one click. */
    untrust: (
      req: In<typeof S.DiagUntrustRequest>,
    ) => Promise<z.infer<typeof S.DiagUntrustResponse>>;
    /** What could be run here. Ranked; empty for a repo with no recognised tooling. */
    detect: (req: In<typeof S.DiagDetectRequest>) => Promise<z.infer<typeof S.DiagDetectResponse>>;
    /** Spawn and parse. Manual only — nothing in the app calls this on a file change. */
    run: (req: In<typeof S.DiagRunRequest>) => Promise<z.infer<typeof S.DiagRunResponse>>;
  };

  /**
   * Workflows (Phase 43) — global, not per-repo, and unrelated to
   * `forge.workflows` above, which means *GitHub Actions*. See `workflow.ts`.
   *
   * `run` resolves with the freshly-minted run rather than the finished one: a
   * run can take minutes, and its progress arrives on `onRunChanged`. That
   * event carries nothing, exactly as `loopRuns.onChanged` does — the consumer
   * re-fetches the single run it is looking at, which needs no ordering
   * guarantee and no reconciliation story in the renderer.
   */
  workflow: {
    list: () => Promise<z.infer<typeof S.WorkflowListResponse>>;
    /** Upsert. A create is a save of an id the store has not seen before. */
    save: (req: In<typeof S.WorkflowSaveRequest>) => Promise<z.infer<typeof S.WorkflowSaveResponse>>;
    /** Refused while one of this workflow's runs is still in flight. */
    delete: (req: In<typeof S.WorkflowDeleteRequest>) => Promise<GitOpResult>;
    run: (req: In<typeof S.WorkflowRunRequest>) => Promise<z.infer<typeof S.WorkflowRunResponse>>;
    cancel: (req: In<typeof S.WorkflowCancelRequest>) => Promise<GitOpResult>;
    runs: {
      list: (
        req: In<typeof S.WorkflowRunsListRequest>,
      ) => Promise<z.infer<typeof S.WorkflowRunsListResponse>>;
      get: (
        req: In<typeof S.WorkflowRunsGetRequest>,
      ) => Promise<z.infer<typeof S.WorkflowRunsGetResponse>>;
    };
    onRunChanged: (handler: () => void) => Unsubscribe;
    /** One-way, like `update.setChannel` — sent on change, not synced on boot. */
    setDefaults: (req: In<typeof S.WorkflowSetDefaultsRequest>) => void;
  };

  /**
   * The workflow demo API (Phase 43 Theme D) — a real `node:http` CRUD server
   * in main, bound to `127.0.0.1` on an ephemeral port, so an HTTP workflow is
   * immediately, honestly testable on a machine with no network.
   *
   * Off by default and started explicitly: a server that starts itself because
   * you opened a view is a surprise, and on macOS it can raise a firewall
   * prompt the user did not ask for. `status` is the only source of the port.
   */
  demoApi: {
    start: () => Promise<z.infer<typeof S.DemoApiStartResponse>>;
    stop: () => Promise<GitOpResult>;
    status: () => Promise<z.infer<typeof S.DemoApiStatusResponse>>;
  };

  /**
   * The onboarding kit's Setup/Update leaves (Phase 49). `plan` reads the
   * template tree and the target repo and writes nothing — safe to call
   * unprompted, the same posture as `diag.detect`. `apply` writes only the
   * exact paths the renderer is holding an approved plan for.
   */
  scaffold: {
    plan: (req: In<typeof S.ScaffoldPlanRequest>) => Promise<z.infer<typeof S.ScaffoldPlanResponse>>;
    apply: (
      req: In<typeof S.ScaffoldApplyRequest>,
    ) => Promise<z.infer<typeof S.ScaffoldApplyResponse>>;
  };

  /**
   * Everything the dashboard draws, in one payload.
   *
   * A single method rather than one per widget: the figures are seven foldings
   * of a single history traversal, and splitting them would mean each widget
   * walking the same log independently. `withChurn` is the one knob, because
   * `--numstat` costs far more than the rest put together.
   */
  stats: {
    summary: (req: In<typeof S.StatsSummaryRequest>) => Promise<RepoStats>;
  };

  /**
   * A repository's own test suites — discovered, trusted per suite, and run.
   *
   * `discover` is safe unprompted, like `diag.detect` — it reads the
   * filesystem and executes nothing. `run` is the second surface in the app
   * that spawns a repository's own binary; it resolves with a run id
   * immediately rather than waiting for the process to exit, and the result
   * arrives on `onOutput`/`onResult` — a suite can run for minutes and the
   * Tests view has to show it working, not hang on one invoke.
   */
  tests: {
    discover: (
      req: In<typeof S.TestsDiscoverRequest>,
    ) => Promise<z.infer<typeof S.TestsDiscoverResponse>>;
    trustStatus: (
      req: In<typeof S.TestsTrustStatusRequest>,
    ) => Promise<z.infer<typeof S.TestsTrustStatusResponse>>;
    /** Approve the exact suite the user was shown, by its current fingerprint. */
    trust: (req: In<typeof S.TestsTrustRequest>) => Promise<z.infer<typeof S.TestsTrustResponse>>;
    untrust: (
      req: In<typeof S.TestsUntrustRequest>,
    ) => Promise<z.infer<typeof S.TestsUntrustResponse>>;
    run: (req: In<typeof S.TestsRunRequest>) => Promise<z.infer<typeof S.TestsRunResponse>>;
    cancel: (req: In<typeof S.TestsCancelRequest>) => void;
    onOutput: (handler: (e: z.infer<typeof S.TestsOutputEvent>) => void) => Unsubscribe;
    onResult: (handler: (e: z.infer<typeof S.TestsResultEvent>) => void) => Unsubscribe;
  };

  watch: {
    onEvent: (handler: (e: WatchEvent) => void) => Unsubscribe;
  };

  /** Native menu items dispatch the same CommandIds as the keybinding service. */
  menu: {
    onCommand: (handler: (id: CommandId) => void) => Unsubscribe;
  };

  cli: {
    status: () => Promise<z.infer<typeof S.CliStatusResponse>>;
    install: (req: In<typeof S.CliInstallRequest>) => Promise<z.infer<typeof S.CliInstallResponse>>;
    uninstall: () => Promise<z.infer<typeof S.CliUninstallResponse>>;
  };

  update: {
    check: () => void;
    download: () => void;
    restart: () => void;
    setChannel: (req: In<typeof S.UpdateSetChannelRequest>) => void;
    onState: (handler: (state: z.infer<typeof S.UpdateStateSchema>) => void) => Unsubscribe;
    /**
     * This version's changelog section from the public mirror repo.
     *
     * Fetched in main rather than by the renderer, and not because the renderer
     * cannot reach the network: it is loaded from `file://` in the packaged
     * build, so a cross-origin fetch would need the CSP widened for one string
     * of markdown. Main already owns every other outbound request this app makes.
     */
    releaseNotes: (req: In<typeof S.ReleaseNotesRequest>) => Promise<z.infer<typeof S.ReleaseNotesResponse>>;
  };

  /**
   * Dev-side startup instrumentation — Phase 36 Theme A. Not a product surface.
   *
   * `enabled` is resolved in the PRELOAD, where `process.env` is still
   * reachable; the renderer cannot read env itself, and making it ask main over
   * IPC would cost a round-trip on the very boot this measures. With the flag
   * unset the renderer skips both `performance.mark` and the send, so an
   * ordinary run pays one boolean check per mark site.
   *
   * `mark` is fire-and-forget like `pty.input`: a mark nobody answers is the
   * point, and awaiting one would perturb the thing being timed.
   */
  perf: {
    enabled: boolean;
    mark: (m: PerfMark) => void;
  };

  systemHealth: () => Promise<z.infer<typeof S.SystemHealthResponse>>;

  protocol: {
    onDeepLink: (handler: (e: z.infer<typeof S.DeepLinkEventSchema>) => void) => Unsubscribe;
  };

  window: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    getState: () => Promise<z.infer<typeof S.WindowStateSchema>>;
    onStateChange: (
      handler: (state: z.infer<typeof S.WindowStateSchema>) => void,
    ) => Unsubscribe;
    /** `false` for a plain reload, `true` to bypass the HTTP cache. */
    reload: (hard: boolean) => void;
  };

  /** Implements `@bilo-io/shell`'s WindowChromeBridge for <TitleBar>. */
  windowChrome: WindowChromeBridge;
};

declare global {
  interface Window {
    /**
     * Injected by the preload script. Always present in the Electron renderer;
     * typed as optional so a plain-browser vitest/jsdom run can assert on its
     * absence instead of crashing at import time.
     */
    midniteStudio?: MidniteStudioBridge;
  }
}
