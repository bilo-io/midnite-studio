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
  /** User-defined sidebar order; re-persisted to `repos.json`. */
  repoReorder: 'mgit:repo:reorder',
  /**
   * Resolve an abbreviated revision to its full 40-char commit sha.
   *
   * Its own channel rather than a flag on `commitDetail` because the caller
   * needs the answer *before* it decides what to select: a linkified `deadbee`
   * in a commit message has to become the selection, and a selection that is
   * not a full sha cannot match a graph row. `commitDetail` would hand back the
   * resolved sha too, but only after fetching a whole commit's worth of data
   * for a reference that might not resolve at all.
   */
  repoRevParse: 'mgit:repo:rev-parse',

  // --- log stream ----------------------------------------------------------
  logStart: 'mgit:log:start',
  logCancel: 'mgit:log:cancel',

  // --- status --------------------------------------------------------------
  statusGet: 'mgit:status:get',
  /**
   * Per-path line counts for a checkout — `git diff --numstat`, both sides.
   *
   * Its own channel rather than fields on `statusGet` because that call is the
   * sidebar's, once per checkout per repository, and it must stay one
   * subprocess. Only the panels that render numbers pay for the numbers.
   */
  statusCounts: 'mgit:status:counts',
  commitDetail: 'mgit:commit:detail',
  /** A path's diff in the worktree or the index. */
  fileDiff: 'mgit:file:diff',
  /** A path's diff *inside a commit* — the worktree-scoped one can't answer this. */
  commitFileDiff: 'mgit:commit:file-diff',

  // --- remotes -------------------------------------------------------------
  remotesList: 'mgit:remotes:list',

  // --- forge (GitHub, via the user's own `gh` CLI) --------------------------
  //
  // Reads, plus ONE deliberate and narrow exception.
  //
  // Every channel here was read-only through Phases 17 and 19, on the rule
  // that the app links out for anything that changes state so a stale cache
  // can never cause a write. Phase 20 reverses that for pull-request review
  // specifically — and only there. The exception is bounded three ways, so it
  // stays auditable rather than becoming the new default:
  //
  // 1. The write channels are named below under their own heading, and every
  //    one of them is served by `forge/gh-write.ts`. `forge/gh-cli.ts` keeps
  //    its "strictly reads" doc comment, and that comment stays literally true.
  // 2. Nothing outside PR review is writable. No issues, no labels, no branch
  //    protection, no PR creation.
  // 3. They take a `repoId` like every read here; owner and repo are still
  //    resolved in main from `.git/config`, so the renderer never chooses what
  //    a subprocess is pointed at.
  /** Is `gh` installed and authenticated? Probed through a login shell. */
  forgeCliStatus: 'mgit:forge:cli-status',
  /** Recent workflow runs for the repo's GitHub remote. */
  forgeRuns: 'mgit:forge:runs',
  /** Open pull requests for the repo's GitHub remote. */
  forgePulls: 'mgit:forge:pulls',
  /*
    The three channels below serve ONE opened pull request, and each is its own
    call for the same reason `forgeWorkflows` is separate from `forgeRuns`: the
    body, the patch and the conversation are payloads that dwarf the listing row
    they hang off, and a combined channel would make opening a PR fetch all
    three whichever tab the reader actually wanted.

    All three take a `repoId` and a PR number. Owner and repo are resolved in
    main from `.git/config`, never sent — see forge-handlers.ts.
  */
  /** One PR's metadata: body, head sha, base branch, line counts. */
  forgePullDetail: 'mgit:forge:pull-detail',
  /** One PR's diff, parsed into per-file hunks in main and capped by bytes. */
  forgePullFiles: 'mgit:forge:pull-files',
  /** One PR's top-level conversation — discussion comments and review submissions. */
  forgePullComments: 'mgit:forge:pull-comments',
  /**
   * One PR's *inline* threads — the comments hanging off lines of the diff.
   *
   * Its own channel rather than a widening of `forgePullComments`, and the
   * reason is which tab reads it: the conversation is the Conversation tab's
   * payload and the threads are the Files tab's, so a combined channel would
   * make each tab fetch the other's. Same split, same reasoning as
   * `forgePullDetail` being separate from `forgePulls`.
   *
   * Read through `gh api graphql`, not REST — only GraphQL's
   * `reviewThreads` carries the resolved flag and the thread id a resolve
   * needs. See `ForgeReviewThread`.
   */
  forgePullThreads: 'mgit:forge:pull-threads',

  // --- forge writes (Phase 20 Themes E, F and G) ---------------------------
  //
  // The nine channels below are the exception the block above documents, and
  // the whole of it. Every one is served by `forge/gh-write.ts`; nothing above
  // this heading writes anything.
  //
  // Theme E — inline threads:
  /** Start a new inline thread on a line of the PR's diff. */
  forgeReviewComment: 'mgit:forge:review-comment',
  /** Add a reply to an existing inline thread. */
  forgeReviewReply: 'mgit:forge:review-reply',
  /** Mark an inline thread resolved, or reopen it. */
  forgeResolveThread: 'mgit:forge:resolve-thread',
  // Themes F and G — the review verdict, the merge, and the three nudges:
  /**
   * Submit a review: approve, request changes, or comment.
   *
   * One channel for three verbs because they are one GitHub action with an
   * `event` — `gh pr review` takes the verb as a flag, and three channels would
   * be three names for one command line.
   */
  forgePullReview: 'mgit:forge:pull-review',
  /**
   * Add a top-level comment to the conversation.
   *
   * Separate from `forgePullReview` even though `--comment` looks similar: `gh
   * pr comment` posts a discussion comment, `gh pr review --comment` submits a
   * *review* that happens to carry no verdict. They land in different
   * collections and the Conversation tab renders them differently.
   */
  forgePullComment: 'mgit:forge:pull-comment',
  /** Merge the pull request. The one irreversible call in this contract. */
  forgePullMerge: 'mgit:forge:pull-merge',
  /** Ask one or more logins for a review. */
  forgePullRequestReview: 'mgit:forge:pull-request-review',
  /** Take a draft pull request out of draft. */
  forgePullReady: 'mgit:forge:pull-ready',
  /** Re-run a workflow run — every job, or only the failed ones. */
  forgeRunRerun: 'mgit:forge:run-rerun',
  /**
   * Issues for the repo's GitHub remote.
   *
   * A repository with issues switched off answers `disabled`, not an error —
   * `gh issue list` exits non-zero for it, and that exit is a configuration
   * the UI states, not a fault it reports.
   */
  forgeIssues: 'mgit:forge:issues',
  /** One run's job/step tree. Cached in main once the run has completed. */
  forgeRunDetail: 'mgit:forge:run-detail',
  /** One run's (or job's) log, capped head-and-tail unless `full` is asked for. */
  forgeRunLog: 'mgit:forge:run-log',
  /**
   * The repo's workflow definitions, for their file paths.
   *
   * Separate from `forgeRuns` on purpose: grouping runs needs only the
   * workflow id the run list already carries, so this second subprocess is
   * paid only when something needs to link to a `.yml`.
   */
  forgeWorkflows: 'mgit:forge:workflows',

  // --- shell ---------------------------------------------------------------
  /**
   * Hand a URL to the OS browser. Protocol-restricted at both ends — see the
   * schema's refine and the main handler's re-check.
   */
  shellOpenExternal: 'mgit:shell:open-external',
  /**
   * Put text on the system clipboard.
   *
   * Goes through main rather than `navigator.clipboard`: the packaged app loads
   * the renderer from `file://`, which is not guaranteed to be a secure context,
   * and the Async Clipboard API is gated on one. A copy button that works in
   * `moon run desktop:start` and silently fails in the shipped dmg is the worst
   * shape this could take.
   */
  clipboardWriteText: 'mgit:clipboard:write-text',

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

  // --- stash -----------------------------------------------------------------
  /** Every stash entry for one checkout, newest first — same shape `for-each-ref` gets. */
  stashList: 'mgit:stash:list',
  opStashPush: 'mgit:stash:push',
  opStashPop: 'mgit:stash:pop',
  opStashApply: 'mgit:stash:apply',
  /**
   * Drop a stash entry. Its own response shape, not the plain `GitOpResult`
   * every other op returns — a drop captures the sha it just made
   * unreachable, so a later undo has an anchor to `git stash store` back
   * from. See `StashDropResultSchema`.
   */
  opStashDrop: 'mgit:stash:drop',
  opStashBranch: 'mgit:stash:branch',

  // --- pty -----------------------------------------------------------------
  // `pty:*` owns the *process*; `terminal:*` below owns the durable *record*.
  // A session outlives its pty (that is the whole point of restoring one), so
  // conflating the two would tie a saved row to a pid that no longer exists.
  ptyCreate: 'mgit:pty:create',
  ptyInput: 'mgit:pty:input',
  ptyResize: 'mgit:pty:resize',
  ptyKill: 'mgit:pty:kill',

  // --- terminal sessions ---------------------------------------------------
  /** Restore: every saved session plus its replayable scrollback. */
  terminalList: 'mgit:terminal:list',
  terminalSave: 'mgit:terminal:save',
  terminalForget: 'mgit:terminal:forget',
  terminalReorder: 'mgit:terminal:reorder',
  /** Built-in agents merged with the user's `agents.json`. */
  agentList: 'mgit:agent:list',
  /** Installed Claude CLI: version + install method, probed via a login shell. */
  agentClaudeInfo: 'mgit:agent:claude-info',
  /** Run the method-matched update command; resolves when it exits. */
  agentClaudeUpdate: 'mgit:agent:claude-update',

  // --- filesystem (Phase 16 reads, Phase 24 writes) -------------------------
  // Reads are scope: repo | claude-home, exactly as before. The four write
  // channels below are repo scope ONLY — `FsWriteScopeSchema` has no
  // `claude-home` member, so a write naming it fails zod parsing at the
  // boundary rather than being refused by a handler someone could later "fix".
  // Every one goes through `fs-scope-write.ts`'s jail, never `confineToRoot`.
  fsListDir: 'mgit:fs:list-dir',
  fsReadFile: 'mgit:fs:read-file',
  /** Overwrite an existing file's content. Refuses on a moved `FsVersion`. */
  fsWriteFile: 'mgit:fs:write-file',
  /** New file or folder. The parent is confined; the final segment is not resolved. */
  fsCreate: 'mgit:fs:create',
  /** Rename or move within the repo. Both endpoints are confined independently. */
  fsRename: 'mgit:fs:rename',
  /** Trash, not `unlink` — recoverable in the Finder. */
  fsDelete: 'mgit:fs:delete',

  // --- system metrics (Phase 18) -------------------------------------------
  // One-way `send`s, not `invoke`s: neither has anything to report back, and
  // the renderer fires `start` again whenever the cadence changes (the flyout
  // opening escalates to 2s, closing drops to 5s). Main treats a repeat start
  // as a re-arm rather than a second sampler — see metrics-service.ts.
  //
  // No `repoId` and no path: these read the machine, not a repository.
  metricsStart: 'mgit:metrics:start',
  metricsStop: 'mgit:metrics:stop',

  // --- repo diagnostics (Phase 18) -----------------------------------------
  // The one place this app runs a binary out of a directory the user merely
  // opened to look at. Everything here is gated on an explicit per-repository
  // trust grant recorded against the exact command — see
  // desktop/src/main/diagnostics/, which states the policy in full.
  //
  // Every one of these takes a `repoId` and NOTHING else. Not a path, and
  // above all not a command: main resolves the checkout through
  // `resolveWorkdir` and reads the command from its own store, so the renderer
  // cannot name what gets executed. Same rule as forge-handlers.ts, and it
  // matters more here.
  /** Is diagnostics enabled for this repo, and does the grant still apply? */
  diagTrustStatus: 'mgit:diag:trust-status',
  /** Record a grant for a command the user has just been shown. */
  diagTrust: 'mgit:diag:trust',
  /** Revoke. The configured command survives; the grant does not. */
  diagUntrust: 'mgit:diag:untrust',
  /** What the detector registry can propose for this repo. Runs nothing. */
  diagDetect: 'mgit:diag:detect',
  /** Run the trusted command and parse its output. Manual, never automatic. */
  diagRun: 'mgit:diag:run',

  // --- repository statistics (Phase 19) ------------------------------------
  /**
   * Every dashboard figure in one payload — the calendar, contributors, the
   * activity feed, churn and repo health.
   *
   * One channel rather than seven, because they are seven foldings of a single
   * history traversal. Seven channels would mean seven walks of the same log,
   * which on a large repository is the difference between a dashboard that
   * opens and one that hangs.
   */
  statsSummary: 'mgit:stats:summary',

  // --- repository tests (Phase 19) ------------------------------------------
  // Discovery runs no repo-local code — it reads package.json/moon.yml and
  // config-file presence, same posture as `diagDetect`. Execution is the
  // second arbitrary-code-execution surface after diagnostics and rides the
  // same trust policy, granted per SUITE rather than per repo — see
  // desktop/src/main/testing/, which states the policy in full.
  /** Suites this checkout declares. Runs nothing; safe unprompted. */
  testsDiscover: 'mgit:tests:discover',
  /** Is this suite trusted to run, and does the grant still apply? */
  testsTrustStatus: 'mgit:tests:trust-status',
  /** Record a grant for a suite the user has just been shown. */
  testsTrust: 'mgit:tests:trust',
  /** Revoke. Re-discovering and re-trusting is one click. */
  testsUntrust: 'mgit:tests:untrust',
  /** Spawn a trusted suite. Resolves with a run id immediately — see `testsOutput`. */
  testsRun: 'mgit:tests:run',
  /** Kill an in-flight run's whole process tree. */
  testsCancel: 'mgit:tests:cancel',

  // --- window chrome -------------------------------------------------------
  windowMinimize: 'mgit:window:minimize',
  windowMaximizeToggle: 'mgit:window:maximize-toggle',
  windowClose: 'mgit:window:close',
  windowState: 'mgit:window:state',
  /** Renderer → main: retint the native window backing to match the theme. */
  windowSetBackground: 'mgit:window:set-background',
  /**
   * Renderer → main: reload the window. Payload is `hard: boolean` — `false`
   * mirrors a browser's plain refresh (`webContents.reload`), `true` mirrors
   * a hard refresh that bypasses the HTTP cache (`webContents.reloadIgnoringCache`).
   */
  windowReload: 'mgit:window:reload',
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
  /**
   * What is actually running inside a pty changed — an agent started or quit.
   *
   * An event rather than a request because the renderer has no way to know when
   * to ask: `$ codex` typed into a plain shell is indistinguishable from any
   * other keystroke until the process exists. Emitted only on a *change*, so an
   * idle terminal produces no traffic at all.
   */
  ptyAgentChanged: 'mgit:pty:agent-changed',
  /** Window maximized/fullscreen state changed, for the frameless TitleBar. */
  windowStateChanged: 'mgit:window:state-changed',
  /** A native-menu item fired — carries a CommandId, dispatched like a keybinding. */
  menuCommand: 'mgit:menu:command',
  /** stdout/stderr chunks from an in-flight Claude CLI update. */
  agentClaudeUpdateData: 'mgit:agent:claude-update-data',
  /**
   * One reading of CPU/RAM/GPU/disk. A metric the machine cannot report is
   * OMITTED from the payload rather than sent as zero — see MetricSample.
   */
  metricsSample: 'mgit:metrics:sample',
  /** Live stdout/stderr chunks from an in-flight suite run — `{runId, chunk}`. */
  testsOutput: 'mgit:tests:output',
  /** A run finished (or was cancelled) — `{runId, suiteId, result}`. */
  testsResult: 'mgit:tests:result',
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
