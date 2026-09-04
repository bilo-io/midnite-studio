/**
 * Every IPC channel name, in one module imported by main, preload AND the
 * renderer's types. A channel string is never written as a literal anywhere else
 * — a typo in one of the three places is otherwise a silent no-op at runtime.
 *
 * Naming: `mstudio:<domain>:<verb>`. Request/response channels go through
 * `ipcRenderer.invoke` / `ipcMain.handle`; stream channels are one-way
 * `webContents.send` pushes and are grouped under EVENT_CHANNELS.
 */
export const CHANNELS = {
  // --- repositories --------------------------------------------------------
  repoOpen: 'mstudio:repo:open',
  /** Native directory picker; resolves to null when the user cancels. */
  repoPickDirectory: 'mstudio:repo:pick-directory',
  repoList: 'mstudio:repo:list',
  repoClose: 'mstudio:repo:close',
  repoRefs: 'mstudio:repo:refs',
  repoWorktrees: 'mstudio:repo:worktrees',
  repoWorktreeAdd: 'mstudio:repo:worktree-add',
  repoWorktreeRemove: 'mstudio:repo:worktree-remove',
  /** User-defined sidebar order; re-persisted to `repos.json`. */
  repoReorder: 'mstudio:repo:reorder',
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
  repoRevParse: 'mstudio:repo:rev-parse',

  // --- log stream ----------------------------------------------------------
  logStart: 'mstudio:log:start',
  logCancel: 'mstudio:log:cancel',

  // --- search stream & blame -----------------------------------------------
  searchStart: 'mstudio:search:start',
  searchCancel: 'mstudio:search:cancel',
  blameRead: 'mstudio:blame:read',

  // --- rebase --------------------------------------------------------------
  rebaseStart: 'mstudio:rebase:start',
  rebaseContinue: 'mstudio:rebase:continue',
  rebaseAbort: 'mstudio:rebase:abort',
  rebaseSkip: 'mstudio:rebase:skip',
  rebaseStatus: 'mstudio:rebase:status',

  // --- status --------------------------------------------------------------

  statusGet: 'mstudio:status:get',
  /**
   * Per-path line counts for a checkout — `git diff --numstat`, both sides.
   *
   * Its own channel rather than fields on `statusGet` because that call is the
   * sidebar's, once per checkout per repository, and it must stay one
   * subprocess. Only the panels that render numbers pay for the numbers.
   */
  statusCounts: 'mstudio:status:counts',
  commitDetail: 'mstudio:commit:detail',
  /** A path's diff in the worktree or the index. */
  fileDiff: 'mstudio:file:diff',
  /** A path's diff *inside a commit* — the worktree-scoped one can't answer this. */
  commitFileDiff: 'mstudio:commit:file-diff',
  /** A conflicted path's parsed regions, for the Studio (Phase 47 Theme D). */
  conflictRegions: 'mstudio:conflict:regions',

  // --- remotes -------------------------------------------------------------
  remotesList: 'mstudio:remotes:list',

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
  forgeCliStatus: 'mstudio:forge:cli-status',
  /** Recent workflow runs for the repo's GitHub remote. */
  forgeRuns: 'mstudio:forge:runs',
  /** Open pull requests for the repo's GitHub remote. */
  forgePulls: 'mstudio:forge:pulls',
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
  forgePullDetail: 'mstudio:forge:pull-detail',
  /** One PR's diff, parsed into per-file hunks in main and capped by bytes. */
  forgePullFiles: 'mstudio:forge:pull-files',
  /** One PR's top-level conversation — discussion comments and review submissions. */
  forgePullComments: 'mstudio:forge:pull-comments',
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
  forgePullThreads: 'mstudio:forge:pull-threads',

  // --- forge writes (Phase 20 Themes E, F and G) ---------------------------
  //
  // The nine channels below are the exception the block above documents, and
  // the whole of it. Every one is served by `forge/gh-write.ts`; nothing above
  // this heading writes anything.
  //
  // Theme E — inline threads:
  /** Start a new inline thread on a line of the PR's diff. */
  forgeReviewComment: 'mstudio:forge:review-comment',
  /** Add a reply to an existing inline thread. */
  forgeReviewReply: 'mstudio:forge:review-reply',
  /** Mark an inline thread resolved, or reopen it. */
  forgeResolveThread: 'mstudio:forge:resolve-thread',
  // Themes F and G — the review verdict, the merge, and the three nudges:
  /**
   * Submit a review: approve, request changes, or comment.
   *
   * One channel for three verbs because they are one GitHub action with an
   * `event` — `gh pr review` takes the verb as a flag, and three channels would
   * be three names for one command line.
   */
  forgePullReview: 'mstudio:forge:pull-review',
  /**
   * Add a top-level comment to the conversation.
   *
   * Separate from `forgePullReview` even though `--comment` looks similar: `gh
   * pr comment` posts a discussion comment, `gh pr review --comment` submits a
   * *review* that happens to carry no verdict. They land in different
   * collections and the Conversation tab renders them differently.
   */
  forgePullComment: 'mstudio:forge:pull-comment',
  /** Merge the pull request. The one irreversible call in this contract. */
  forgePullMerge: 'mstudio:forge:pull-merge',
  /** Ask one or more logins for a review. */
  forgePullRequestReview: 'mstudio:forge:pull-request-review',
  /** Take a draft pull request out of draft. */
  forgePullReady: 'mstudio:forge:pull-ready',
  /** Re-run a workflow run — every job, or only the failed ones. */
  forgeRunRerun: 'mstudio:forge:run-rerun',
  /**
   * Issues for the repo's GitHub remote.
   *
   * A repository with issues switched off answers `disabled`, not an error —
   * `gh issue list` exits non-zero for it, and that exit is a configuration
   * the UI states, not a fault it reports.
   */
  forgeIssues: 'mstudio:forge:issues',
  /**
   * One issue's metadata: body, plus every listing field. Its own channel
   * for the same reason `forgePullDetail` is separate from `forgePulls` — a
   * body is a payload the list never needs.
   */
  forgeIssueDetail: 'mstudio:forge:issue-detail',
  /**
   * One issue's conversation — reuses `forgePullComments`' own REST path and
   * parser, since GitHub models a PR's conversation as issue comments on the
   * issue-numbered route. No `reviews` half: reviews are a pull-request-only
   * concept.
   */
  forgeIssueComments: 'mstudio:forge:issue-comments',
  /** One run's job/step tree. Cached in main once the run has completed. */
  forgeRunDetail: 'mstudio:forge:run-detail',
  /** One run's (or job's) log, capped head-and-tail unless `full` is asked for. */
  forgeRunLog: 'mstudio:forge:run-log',
  /**
   * The repo's workflow definitions, for their file paths.
   *
   * Separate from `forgeRuns` on purpose: grouping runs needs only the
   * workflow id the run list already carries, so this second subprocess is
   * paid only when something needs to link to a `.yml`.
   */
  forgeWorkflows: 'mstudio:forge:workflows',

  // --- forge projects (GitHub ProjectV2 — Phase 40) -------------------------
  //
  // Its own `forge-project:` namespace rather than folded into `forge:` above:
  // ProjectV2 is GraphQL-only, served by its own `gh-project.ts` (Theme B), and
  // ships its own read/write split the same way the block above documents one
  // for PR review — `list`/`items`/`fields` never write, `set-field`/`add-item`
  // are the two writes this phase allows and nothing else. See
  // `shared/src/domain/forge-project.ts` for the contract these channels move.
  /** The ProjectV2 boards visible to the open repo's owner. */
  forgeProjectList: 'mstudio:forge-project:list',
  /** One board's items, paginated — see `ForgeProjectItemsResult.nextCursor`. */
  forgeProjectItems: 'mstudio:forge-project:items',
  /** One board's field definitions, for the table's columns. */
  forgeProjectFields: 'mstudio:forge-project:fields',
  /** `updateProjectV2ItemFieldValue` — the one per-cell write this phase allows. */
  forgeProjectSetField: 'mstudio:forge-project:set-field',
  /** `addProjectV2ItemById` — attach an existing issue or PR to the board. */
  forgeProjectAddItem: 'mstudio:forge-project:add-item',
  /** `clearProjectV2ItemFieldValue` — empty a cell, e.g. dropping a card on "No status". */
  forgeProjectClearField: 'mstudio:forge-project:clear-field',

  // --- shell ---------------------------------------------------------------
  /**
   * Hand a URL to the OS browser. Protocol-restricted at both ends — see the
   * schema's refine and the main handler's re-check.
   */
  shellOpenExternal: 'mstudio:shell:open-external',
  /**
   * Reveal a repo-scoped path in the OS file manager. Repo scope only, the same
   * jail `fs-handlers.ts` confines every read through — this is a read, not a
   * write, but it still crosses into `~/.claude` if it were let to, which is why
   * it takes the narrower `FsRepoScope` rather than a bare absolute path.
   */
  shellShowItemInFolder: 'mstudio:shell:show-item-in-folder',
  /**
   * Put text on the system clipboard.
   *
   * Goes through main rather than `navigator.clipboard`: the packaged app loads
   * the renderer from `file://`, which is not guaranteed to be a secure context,
   * and the Async Clipboard API is gated on one. A copy button that works in
   * `moon run desktop:start` and silently fails in the shipped dmg is the worst
   * shape this could take.
   */
  clipboardWriteText: 'mstudio:clipboard:write-text',

  // --- mutating operations -------------------------------------------------
  opCheckout: 'mstudio:op:checkout',
  opBranchCreate: 'mstudio:op:branch-create',
  opBranchDelete: 'mstudio:op:branch-delete',
  opBranchRename: 'mstudio:op:branch-rename',
  opTagCreate: 'mstudio:op:tag-create',
  opMerge: 'mstudio:op:merge',
  opRebase: 'mstudio:op:rebase',
  opCherryPick: 'mstudio:op:cherry-pick',
  opReset: 'mstudio:op:reset',
  opStage: 'mstudio:op:stage',
  opUnstage: 'mstudio:op:unstage',
  opDiscard: 'mstudio:op:discard',
  /** Whole-file conflict resolution (Phase 47 Theme B) — accept-ours/theirs/base. */
  opConflictResolveWholeFile: 'mstudio:op:conflict-resolve-whole-file',
  /** One region within a conflicted path (Phase 47 Theme C) — ours/theirs/both. */
  opConflictApplyHunk: 'mstudio:op:conflict-apply-hunk',
  opCommit: 'mstudio:op:commit',
  opFetch: 'mstudio:op:fetch',
  opPull: 'mstudio:op:pull',
  opPush: 'mstudio:op:push',
  opAbort: 'mstudio:op:abort',
  opContinue: 'mstudio:op:continue',
  /** Blast radius for a destructive op — `rev-list --count` of orphaned commits. */
  opBlastRadius: 'mstudio:op:blast-radius',
  cliStatus: 'mstudio:cli:status',
  cliInstall: 'mstudio:cli:install',
  cliUninstall: 'mstudio:cli:uninstall',
  updateCheck: 'mstudio:update:check',
  updateDownload: 'mstudio:update:download',
  updateRestart: 'mstudio:update:restart',
  updateSetChannel: 'mstudio:update:set-channel',
  /** This version's changelog section, fetched from the public mirror repo. */
  updateReleaseNotes: 'mstudio:update:release-notes',
  systemHealth: 'mstudio:system:health',

  // --- stash -----------------------------------------------------------------
  /** Every stash entry for one checkout, newest first — same shape `for-each-ref` gets. */
  stashList: 'mstudio:stash:list',
  opStashPush: 'mstudio:stash:push',
  opStashPop: 'mstudio:stash:pop',
  opStashApply: 'mstudio:stash:apply',
  /**
   * Drop a stash entry. Its own response shape, not the plain `GitOpResult`
   * every other op returns — a drop captures the sha it just made
   * unreachable, so a later undo has an anchor to `git stash store` back
   * from. See `StashDropResultSchema`.
   */
  opStashDrop: 'mstudio:stash:drop',
  opStashBranch: 'mstudio:stash:branch',
  /**
   * `git stash store` — restore a previously-dropped stash from its captured
   * sha (Phase 22 Theme H's undo for `opStashDrop`). A plain `GitOpResult`:
   * unlike a drop this never discovers anything worth widening the response
   * for.
   */
  opStashStore: 'mstudio:stash:store',
  /** A stash entry's three-part file list (Phase 22 Theme D). See `StashDetailSchema`. */
  stashDetail: 'mstudio:stash:detail',
  /** One file's hunks within one part of a stash entry (Phase 22 Theme D). */
  stashDiff: 'mstudio:stash:diff',

  // --- reflog ----------------------------------------------------------------
  /** `readReflog` — the History view's reflog tab (Phase 22 Theme G). */
  reflogList: 'mstudio:reflog:list',

  // --- pty -----------------------------------------------------------------
  // `pty:*` owns the *process*; `terminal:*` below owns the durable *record*.
  // A session outlives its pty (that is the whole point of restoring one), so
  // conflating the two would tie a saved row to a pid that no longer exists.
  ptyCreate: 'mstudio:pty:create',
  ptyInput: 'mstudio:pty:input',
  ptyResize: 'mstudio:pty:resize',
  ptyKill: 'mstudio:pty:kill',
  /**
   * The current ring-buffer contents for a live pty, trimmed the same way a
   * restart's scrollback is.
   *
   * Its own invoke rather than bytes on `terminal:list`: the list answers once
   * at boot for every session, while a snapshot is needed per reveal for
   * exactly one — keeping the firehose out of the list keeps `hydrate` cheap
   * and a later reveal never sees a stale boot-time copy.
   */
  ptySnapshot: 'mstudio:pty:snapshot',

  // --- terminal sessions ---------------------------------------------------
  /** Restore: every saved session plus its replayable scrollback. */
  terminalList: 'mstudio:terminal:list',
  terminalSave: 'mstudio:terminal:save',
  terminalForget: 'mstudio:terminal:forget',
  terminalReorder: 'mstudio:terminal:reorder',
  /** Built-in agents merged with the user's `agents.json`. */
  agentList: 'mstudio:agent:list',
  /** Installed Claude CLI: version + install method, probed via a login shell. */
  agentClaudeInfo: 'mstudio:agent:claude-info',
  /** Run the method-matched update command; resolves when it exits. */
  agentClaudeUpdate: 'mstudio:agent:claude-update',

  // --- browser (Phase 32) ---------------------------------------------------
  // A `WebContentsView` per tab, owned by `browser-service.ts`. Chrome state
  // (nav, title, favicon, loading) pushes over the single `browserEvent`
  // channel below rather than one channel per kind — see BrowserEventSchema.
  browserCreate: 'mstudio:browser:create',
  browserClose: 'mstudio:browser:close',
  browserNavigate: 'mstudio:browser:navigate',
  browserBack: 'mstudio:browser:back',
  browserForward: 'mstudio:browser:forward',
  browserReload: 'mstudio:browser:reload',
  browserStop: 'mstudio:browser:stop',
  browserSetBounds: 'mstudio:browser:set-bounds',
  browserSetVisible: 'mstudio:browser:set-visible',
  /** Which tab is on top — only one view is ever attached-and-visible. */
  browserActivate: 'mstudio:browser:activate',
  browserDevtools: 'mstudio:browser:devtools',
  browserFind: 'mstudio:browser:find',
  browserFindStop: 'mstudio:browser:find-stop',
  browserClearData: 'mstudio:browser:clear-data',

  // --- filesystem (Phase 16 reads, Phase 24 writes) -------------------------
  // Reads are scope: repo | claude-home, exactly as before. The four write
  // channels below are repo scope ONLY — `FsWriteScopeSchema` has no
  // `claude-home` member, so a write naming it fails zod parsing at the
  // boundary rather than being refused by a handler someone could later "fix".
  // Every one goes through `fs-scope-write.ts`'s jail, never `confineToRoot`.
  fsListDir: 'mstudio:fs:list-dir',
  fsReadFile: 'mstudio:fs:read-file',
  /** Overwrite an existing file's content. Refuses on a moved `FsVersion`. */
  fsWriteFile: 'mstudio:fs:write-file',
  /** New file or folder. The parent is confined; the final segment is not resolved. */
  fsCreate: 'mstudio:fs:create',
  /** Rename or move within the repo. Both endpoints are confined independently. */
  fsRename: 'mstudio:fs:rename',
  /** Trash, not `unlink` — recoverable in the Finder. */
  fsDelete: 'mstudio:fs:delete',
  /**
   * A directory's file count and total bytes, for a delete confirm's blast
   * radius. Bounded by `FS_DIR_STATS_WALK_CAP` — a truncated flag says so
   * rather than the count silently understating a huge tree.
   */
  fsDirStats: 'mstudio:fs:dir-stats',
  /** `git grep` over the tracked working tree — repo scope only, read-only. */
  fsSearch: 'mstudio:fs:search',
  /** List tracked and untracked repository files via `git ls-files` — Phase 23 Theme G. */
  fsListFiles: 'mstudio:fs:list-files',

  // --- system metrics (Phase 18) -------------------------------------------
  // One-way `send`s, not `invoke`s: neither has anything to report back, and
  // the renderer fires `start` again whenever the cadence changes (the flyout
  // opening escalates to 2s, closing drops to 5s). Main treats a repeat start
  // as a re-arm rather than a second sampler — see metrics-service.ts.
  //
  // No `repoId` and no path: these read the machine, not a repository.
  metricsStart: 'mstudio:metrics:start',
  metricsStop: 'mstudio:metrics:stop',

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
  diagTrustStatus: 'mstudio:diag:trust-status',
  /** Record a grant for a command the user has just been shown. */
  diagTrust: 'mstudio:diag:trust',
  /** Revoke. The configured command survives; the grant does not. */
  diagUntrust: 'mstudio:diag:untrust',
  /** What the detector registry can propose for this repo. Runs nothing. */
  diagDetect: 'mstudio:diag:detect',
  /** Run the trusted command and parse its output. Manual, never automatic. */
  diagRun: 'mstudio:diag:run',

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
  statsSummary: 'mstudio:stats:summary',

  // --- repository tests (Phase 19) ------------------------------------------
  // Discovery runs no repo-local code — it reads package.json/moon.yml and
  // config-file presence, same posture as `diagDetect`. Execution is the
  // second arbitrary-code-execution surface after diagnostics and rides the
  // same trust policy, granted per SUITE rather than per repo — see
  // desktop/src/main/testing/, which states the policy in full.
  /** Suites this checkout declares. Runs nothing; safe unprompted. */
  testsDiscover: 'mstudio:tests:discover',
  /** Is this suite trusted to run, and does the grant still apply? */
  testsTrustStatus: 'mstudio:tests:trust-status',
  /** Record a grant for a suite the user has just been shown. */
  testsTrust: 'mstudio:tests:trust',
  /** Revoke. Re-discovering and re-trusting is one click. */
  testsUntrust: 'mstudio:tests:untrust',
  /** Spawn a trusted suite. Resolves with a run id immediately — see `testsOutput`. */
  testsRun: 'mstudio:tests:run',
  /** Kill an in-flight run's whole process tree. */
  testsCancel: 'mstudio:tests:cancel',

  // --- councils (Phase 34) ---------------------------------------------------
  // A council is global, not per-repo — see `council.ts`'s own doc comment.
  // Member/synthesizer processes are spawned and read through the existing
  // `pty:*` channels above (`onData`/`onExit`/`snapshot`), filtered by the
  // `ptyId` a live `CouncilRunGet` answer carries — no separate event channel
  // for their output.
  councilList: 'mstudio:council:list',
  councilGet: 'mstudio:council:get',
  councilCreate: 'mstudio:council:create',
  councilUpdateMembers: 'mstudio:council:update-members',
  councilRemove: 'mstudio:council:remove',
  councilRunStart: 'mstudio:council:run-start',
  councilRunGet: 'mstudio:council:run-get',
  councilRunListForCouncil: 'mstudio:council:run-list',
  councilRunSkipMember: 'mstudio:council:run-skip-member',
  councilRunRetryMember: 'mstudio:council:run-retry-member',

  // --- FAB loop runs (Phase 35) ----------------------------------------------
  // The durable trace of the FAB panel's loop runs. `start` is announced by the
  // renderer (it owns session creation); the run's END is owned by MAIN — a
  // natural exit is finalised off the pty exit itself, so a renderer reload
  // mid-run cannot lose the `endedAt`. `stop` is keyed by sessionId, not runId,
  // so a remounted tab needs no bookkeeping to stop what it started.
  loopRunsList: 'mstudio:loop-runs:list',
  loopRunsStart: 'mstudio:loop-runs:start',
  loopRunsStop: 'mstudio:loop-runs:stop',

  // --- workflows (Phase 43) --------------------------------------------------
  // A workflow is global, not per-repo, and nothing here touches git — see
  // `workflow.ts`'s own doc comment, including why these are `workflow*` and
  // never `forgeWorkflow*` (that name is taken, by GitHub Actions).
  // `run` mints the runId in MAIN and returns it immediately; progress arrives
  // as a bare `workflowRunChanged` ping the renderer answers with a re-fetch.
  workflowList: 'mstudio:workflow:list',
  workflowSave: 'mstudio:workflow:save',
  workflowDelete: 'mstudio:workflow:delete',
  workflowRun: 'mstudio:workflow:run',
  workflowCancel: 'mstudio:workflow:cancel',
  workflowRunsList: 'mstudio:workflow-runs:list',
  workflowRunsGet: 'mstudio:workflow-runs:get',
  /**
   * One-way, fire-and-forget (Theme I) — the same shape `updateSetChannel`
   * uses for a renderer setting that reaches main: `ipcMain.on`, not a
   * request/response `invoke`. Sent on change only, not synced on boot,
   * matching that precedent's own posture; main starts at the constants in
   * `workflow.ts` until the Settings page is opened and changed.
   */
  workflowSetDefaults: 'mstudio:workflow:set-defaults',

  // --- workflow demo API (Phase 43 Theme D) ----------------------------------
  // A real `node:http` CRUD server bound to 127.0.0.1 on an EPHEMERAL port, so
  // an HTTP workflow is testable on a machine with no network. Off by default,
  // started explicitly — a server that starts because you opened a view is a
  // surprise, and on macOS can raise a firewall prompt nobody asked for.
  demoApiStart: 'mstudio:demo-api:start',
  demoApiStop: 'mstudio:demo-api:stop',
  demoApiStatus: 'mstudio:demo-api:status',

  // --- video (Phase 44) -------------------------------------------------------
  // Video Studio is global, not per-repo, and this app ships no Remotion
  // dependency anywhere — see `video.ts`'s own doc comment. Projects are
  // discovered from disk, not registered, so there is no `videoProjectSave`.
  videoProjectList: 'mstudio:video:project-list',
  videoProjectGet: 'mstudio:video:project-get',
  videoProjectCreate: 'mstudio:video:project-create',
  videoProjectRemove: 'mstudio:video:project-remove',
  videoStudioStart: 'mstudio:video:studio-start',
  videoStudioStop: 'mstudio:video:studio-stop',
  videoStudioStatus: 'mstudio:video:studio-status',
  videoRenderStart: 'mstudio:video:render-start',
  videoRenderCancel: 'mstudio:video:render-cancel',
  videoRenderList: 'mstudio:video:render-list',
  videoToolchain: 'mstudio:video:toolchain',

  // --- onboarding kit scaffold (Phase 49) -----------------------------------
  // `plan` reads the template tree and the target repo, hashes both sides and
  // classifies every entry — it writes nothing. `apply` writes only the exact
  // paths the renderer is holding an approved plan for, re-hashing each one
  // immediately before writing. Both take a `repoId`, never a raw path: main
  // resolves the checkout through `resolveWorkdir`, same rule as `diag*` above.
  scaffoldPlan: 'mstudio:scaffold:plan',
  scaffoldApply: 'mstudio:scaffold:apply',

  // --- window chrome -------------------------------------------------------
  windowMinimize: 'mstudio:window:minimize',
  windowMaximizeToggle: 'mstudio:window:maximize-toggle',
  windowClose: 'mstudio:window:close',
  windowState: 'mstudio:window:state',
  /** Renderer → main: retint the native window backing to match the theme. */
  windowSetBackground: 'mstudio:window:set-background',
  /**
   * Renderer → main: reload the window. Payload is `hard: boolean` — `false`
   * mirrors a browser's plain refresh (`webContents.reload`), `true` mirrors
   * a hard refresh that bypasses the HTTP cache (`webContents.reloadIgnoringCache`).
   */
  windowReload: 'mstudio:window:reload',
} as const;

/** One-way pushes from main → renderer (`webContents.send`). */
export const EVENT_CHANNELS = {
  /** A batch of laid-out graph rows for an in-flight log stream. */
  logBatch: 'mstudio:log:batch',
  /** The log stream finished (or was cancelled). */
  logDone: 'mstudio:log:done',
  /** A batch of search hits (commits or content) for an in-flight search stream. */
  searchBatch: 'mstudio:search:batch',
  /** The search stream finished (or was cancelled / truncated). */
  searchDone: 'mstudio:search:done',
  /** Something changed on disk — see WatchEvent.kind. */

  watchEvent: 'mstudio:watch:event',
  /** Raw pty output, as a Uint8Array (structured clone — never base64). */
  ptyData: 'mstudio:pty:data',
  ptyExit: 'mstudio:pty:exit',
  /**
   * What is actually running inside a pty changed — an agent started or quit.
   *
   * An event rather than a request because the renderer has no way to know when
   * to ask: `$ codex` typed into a plain shell is indistinguishable from any
   * other keystroke until the process exists. Emitted only on a *change*, so an
   * idle terminal produces no traffic at all.
   */
  ptyAgentChanged: 'mstudio:pty:agent-changed',
  /**
   * The shell's foreground process changed — a command started or finished.
   *
   * `command: null` means the shell is back at a bare prompt with nothing in
   * the foreground; a non-null value is held by the renderer until the next
   * change, so a session's auto-name survives the command finishing.
   */
  ptyCommandChanged: 'mstudio:pty:command-changed',
  /**
   * A live pty's guessed activity changed — thinking, waiting, idle, or `null`
   * for "the detector has nothing to say" (no marker set, or disabled).
   *
   * Emitted from main's single `ptyData` send site rather than from the
   * renderer, so the status bar's agent count stays right while the terminal
   * panel is collapsed and every `TerminalView` is unmounted.
   */
  ptyActivity: 'mstudio:pty:activity',
  /** Window maximized/fullscreen state changed, for the frameless TitleBar. */
  windowStateChanged: 'mstudio:window:state-changed',
  /** A native-menu item fired — carries a CommandId, dispatched like a keybinding. */
  menuCommand: 'mstudio:menu:command',
  /** stdout/stderr chunks from an in-flight Claude CLI update. */
  agentClaudeUpdateData: 'mstudio:agent:claude-update-data',
  /**
   * One reading of CPU/RAM/GPU/disk. A metric the machine cannot report is
   * OMITTED from the payload rather than sent as zero — see MetricSample.
   */
  metricsSample: 'mstudio:metrics:sample',
  /** Live stdout/stderr chunks from an in-flight suite run — `{runId, chunk}`. */
  testsOutput: 'mstudio:tests:output',
  /** A run finished (or was cancelled) — `{runId, suiteId, result}`. */
  testsResult: 'mstudio:tests:result',
  /** A discriminated-union chrome event for one browser tab — see BrowserEventSchema. */
  browserEvent: 'mstudio:browser:event',
  /**
   * A loop run record changed in main — started, stopped, or finalised off a
   * pty exit. Carries nothing: the history list re-fetches `loopRunsList`,
   * which is tiny (capped) and saves inventing a second shape for one row.
   */
  loopRunsChanged: 'mstudio:loop-runs:changed',
  /**
   * A workflow run advanced — started, a node settled, cancelled, finished.
   * Carries nothing, exactly as `loopRunsChanged` does: the consumer re-fetches
   * the one run it is looking at. A per-node payload would need an ordering
   * guarantee and a reconciliation story in the renderer; a ping plus a
   * re-fetch needs neither.
   */
  workflowRunChanged: 'mstudio:workflow:run-changed',
  /** A studio's status changed — see `VideoStudioChangedEventSchema`. */
  videoStudioChanged: 'mstudio:video:studio-changed',
  /** A render's status/progress advanced — see `VideoRenderProgressEventSchema`. */
  videoRenderProgress: 'mstudio:video:render-progress',
  updateState: 'mstudio:update:state',
  deepLink: 'mstudio:protocol:deep-link',
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
export const WINDOW_FRAMELESS_ARG = '--mstudio-frameless=';

/**
 * CLI switch carrying `app.getVersion()` from main into the preload.
 *
 * Here rather than on a channel for the same reason `homeDir` is a value: it
 * never changes for the life of the process, and the rail's version pill needs
 * it on its first paint — an async round-trip would render an empty pill and
 * then fill it in. And it has to come from main at all because only main can
 * ask Electron: the renderer's own `package.json` version is the *source*
 * version, which is the packaged app's only by the lockstep release rule, and
 * silently wrong the moment that rule bends.
 */
export const APP_VERSION_ARG = '--mstudio-app-version=';

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];
export type EventChannelName = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS];
