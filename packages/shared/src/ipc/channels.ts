/**
 * Every IPC channel name, in one module imported by main, preload AND the
 * renderer's types. A channel string is never written as a literal anywhere else
 * — a typo in one of the three places is otherwise a silent no-op at runtime.
 *
 * Naming: `mgit:<domain>:<verb>`. Request/response channels go through
 * `ipcRenderer.invoke` / `ipcMain.handle`; stream channels are one-way
 * `webContents.send` pushes and are grouped under EVENT_CHANNELS.
 */
export const CHANNELS = {
  // --- repositories --------------------------------------------------------
  repoOpen: 'mgit:repo:open',
  /** Native directory picker; resolves to null when the user cancels. */
  repoPickDirectory: 'mgit:repo:pick-directory',
  repoList: 'mgit:repo:list',
  repoClose: 'mgit:repo:close',
  repoRefs: 'mgit:repo:refs',
  repoWorktrees: 'mgit:repo:worktrees',
  repoWorktreeAdd: 'mgit:repo:worktree-add',
  repoWorktreeRemove: 'mgit:repo:worktree-remove',

  // --- log stream ----------------------------------------------------------
  logStart: 'mgit:log:start',
  logCancel: 'mgit:log:cancel',

  // --- status --------------------------------------------------------------
  statusGet: 'mgit:status:get',
  commitDetail: 'mgit:commit:detail',
  /** A path's diff in the worktree or the index. */
  fileDiff: 'mgit:file:diff',
  /** A path's diff *inside a commit* — the worktree-scoped one can't answer this. */
  commitFileDiff: 'mgit:commit:file-diff',

  // --- mutating operations -------------------------------------------------
  opCheckout: 'mgit:op:checkout',
  opBranchCreate: 'mgit:op:branch-create',
  opBranchDelete: 'mgit:op:branch-delete',
  opBranchRename: 'mgit:op:branch-rename',
  opTagCreate: 'mgit:op:tag-create',
  opMerge: 'mgit:op:merge',
  opRebase: 'mgit:op:rebase',
  opCherryPick: 'mgit:op:cherry-pick',
  opReset: 'mgit:op:reset',
  opStage: 'mgit:op:stage',
  opUnstage: 'mgit:op:unstage',
  opDiscard: 'mgit:op:discard',
  opCommit: 'mgit:op:commit',
  opFetch: 'mgit:op:fetch',
  opPull: 'mgit:op:pull',
  opPush: 'mgit:op:push',
  opAbort: 'mgit:op:abort',
  opContinue: 'mgit:op:continue',
  /** Blast radius for a destructive op — `rev-list --count` of orphaned commits. */
  opBlastRadius: 'mgit:op:blast-radius',

  // --- pty -----------------------------------------------------------------
  ptyCreate: 'mgit:pty:create',
  ptyInput: 'mgit:pty:input',
  ptyResize: 'mgit:pty:resize',
  ptyKill: 'mgit:pty:kill',

  // --- window chrome -------------------------------------------------------
  windowMinimize: 'mgit:window:minimize',
  windowMaximizeToggle: 'mgit:window:maximize-toggle',
  windowClose: 'mgit:window:close',
  windowState: 'mgit:window:state',
  /** Renderer → main: retint the native window backing to match the theme. */
  windowSetBackground: 'mgit:window:set-background',
} as const;

/** One-way pushes from main → renderer (`webContents.send`). */
export const EVENT_CHANNELS = {
  /** A batch of laid-out graph rows for an in-flight log stream. */
  logBatch: 'mgit:log:batch',
  /** The log stream finished (or was cancelled). */
  logDone: 'mgit:log:done',
  /** Something changed on disk — see WatchEvent.kind. */
  watchEvent: 'mgit:watch:event',
  /** Raw pty output, as a Uint8Array (structured clone — never base64). */
  ptyData: 'mgit:pty:data',
  ptyExit: 'mgit:pty:exit',
  /** Window maximized/fullscreen state changed, for the frameless TitleBar. */
  windowStateChanged: 'mgit:window:state-changed',
  /** A native-menu item fired — carries a CommandId, dispatched like a keybinding. */
  menuCommand: 'mgit:menu:command',
} as const;

/**
 * CLI switch carrying the frameless flag from main into the preload.
 *
 * Passed via `webPreferences.additionalArguments` rather than re-derived in the
 * preload from `process.platform`. The window options in main are the single
 * source of truth for whether the native title bar was dropped; a second
 * platform check in the preload is a copy that silently disagrees the moment
 * the window-creation logic gains a condition (a setting, a platform, a debug
 * flag) — and the symptom is an app-drawn title bar stacked on a native one.
 */
export const WINDOW_FRAMELESS_ARG = '--mgit-frameless=';

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
export type EventChannelName = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS];
