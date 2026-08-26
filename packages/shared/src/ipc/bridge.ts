import type { z } from 'zod';

import type {
  GitOpResult,
  GraphRow,
  MetricSample,
  Ref,
  Remote,
  RepoDescriptor,
  RepoStats,
  StatusCounts,
  StatusResult,
  WatchEvent,
  Worktree,
} from '../domain';
import type { CommandId } from '../keybindings';
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
 * Everything the preload exposes on `window.midniteGit`. This type is the
 * renderer's only view of the main process — it may not import `electron`, so
 * this is the API surface in full.
 */
export type MidniteGitBridge = {
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
  };

  /**
   * Hand-offs to the OS. Deliberately one method wide.
   *
   * `openExternal` is protocol-restricted in the schema AND re-checked in the
   * handler — see OPEN_EXTERNAL_PROTOCOLS. Resolves `{ok:false}` on a refused
   * URL rather than rejecting, so a bad link in a commit message is a no-op
   * rather than an unhandled rejection in the renderer.
   */
  shell: {
    openExternal: (
      req: In<typeof S.OpenExternalRequest>,
    ) => Promise<z.infer<typeof S.OpenExternalResponse>>;
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

  pty: {
    create: (req: In<typeof S.PtyCreateRequest>) => Promise<z.infer<typeof S.PtyCreateResponse>>;
    input: (req: In<typeof S.PtyInputRequest>) => void;
    resize: (req: In<typeof S.PtyResizeRequest>) => void;
    kill: (req: In<typeof S.PtyKillRequest>) => void;
    /**
     * Terminal output. Bytes cross the boundary as a `Uint8Array` via structured
     * clone — no base64 round-trip (the app is in-process; only a WebSocket path
     * would need one), so xterm gets the raw bytes and multi-byte UTF-8 split
     * across chunks stays intact.
     */
    onData: (handler: (e: { ptyId: string; data: Uint8Array }) => void) => Unsubscribe;
    onExit: (handler: (e: z.infer<typeof S.PtyExitEvent>) => void) => Unsubscribe;
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
   * Read-only filesystem browsing (Phase 16). No write methods exist — the
   * file explorer's inability to edit is a property of this contract.
   */
  fs: {
    listDir: (
      req: In<typeof S.FsListDirRequest>,
    ) => Promise<z.infer<typeof S.FsListDirResponse>>;
    readFile: (
      req: In<typeof S.FsReadFileRequest>,
    ) => Promise<z.infer<typeof S.FsReadFileResponse>>;
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

  watch: {
    onEvent: (handler: (e: WatchEvent) => void) => Unsubscribe;
  };

  /** Native menu items dispatch the same CommandIds as the keybinding service. */
  menu: {
    onCommand: (handler: (id: CommandId) => void) => Unsubscribe;
  };

  window: {
    minimize: () => void;
    toggleMaximize: () => void;
    close: () => void;
    getState: () => Promise<z.infer<typeof S.WindowStateSchema>>;
    onStateChange: (
      handler: (state: z.infer<typeof S.WindowStateSchema>) => void,
    ) => Unsubscribe;
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
    midniteGit?: MidniteGitBridge;
  }
}
