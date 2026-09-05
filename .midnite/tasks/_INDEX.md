# Midnite Studio — Phase Index

**Headlines:**

- **[Phase 69 · A tracker that can count](phases/phase-69-a-tracker-that-can-count.md)** (97% · 30/31, [PR #168](https://github.com/bilo-io/midnite-studio/pull/168)) — **Themes A, B, C landed** (2026-09-05): the automated tracker check (`scripts/tracker-check.mjs`, seven consistency rules, `--fix` for arithmetic rules 3 and 7) wired as `root:tracker-check` and in CI, the four structural bugs resolved (Phase 32's duplicate H/I, Phase 33's `◐` stamps, Phase 25's heading level, Phase 35's theme key), and the index numbers reconciled across all 19 drifted phases with `outstanding.md` updated. One human verification item stays open. 31 items, three themes, no dependency.

- **[Phase 68 · Where focus goes when the dialog closes](phases/phase-68-where-focus-goes.md)** (0% · 0/37) — **Planned, not started.** Eleven overlays trap focus; **three restore it, each a different way, and eight drop it on the floor** — onto `<body>`, so the next Tab starts from the top of the document and a screen-reader user loses their place. [Phase 62](phases/phase-62-one-escape-one-dismissal.md) named this and correctly declined it as *'a different hook'*. The thesis is why it cannot be fixed one dialog at a time: the newest modal in the app copied `ConfirmDialog` (`setup-dialog.tsx:21` says so outright), two more are the **same skeleton byte for byte**, and `ConfirmDialog` does not restore — so the defect lives in the file everybody copies and will keep propagating until the shell carries the behaviour. Hence restoration goes *inside* `useFocusTrap`, signature unchanged, fixing eight components with no edit to any of them. The one general implementation that exists has three bugs: `palette.tsx` restores without an `isConnected` check (`document.contains`/`isConnected` → **0 hits** in the renderer, and the palette *navigates views*, so the captured node is routinely detached), without handling `<body>`, and without the `preventScroll` every other focus call in the repo passes. A third implementation uses `querySelector('[data-testid=…]')` as production wiring. Test coverage exactly matches implementation — the three e2e restore tests cover precisely the three components that restore — so nothing would catch a regression in the other eight. Also folded in: `context-menu.tsx` declares `role="menu"` and `role="menuitem"` with **zero** focus/tabIndex/autoFocus, advertising a keyboard contract it does not implement (submenus open on hover only, so they are unreachable without a mouse), and `onboarding-modal.tsx` and `rebase-modal.tsx` have no role, no `aria-modal` and no trap at all. 37 items, four small themes, `packages/app` only, no new dependency.

- **[Phase 67 · The sessions you closed](phases/phase-67-the-sessions-you-closed.md)** (0% · 0/42) — **Planned, not started.** The rail has had a **Sessions** row since Phase 23 and it renders a `Placeholder` — the **only** one of seventeen `ViewId`s with no arm in the render chain, pointing users at a `todo/` directory deleted in `1d6fd65`. What it should be is not a guess: `nav-icons.ts:77` gives it `LuHistory`, and the palette already calls it *'Agent Sessions'* with the keywords *'agent session history transcripts'*. **The fact the phase turns on is that there is no history to show.** Closing a session does not end it, it erases it — `terminal:forget` drops the row from `terminals.json` **and** `rm`s `scrollback/<id>.bin` — and the three modelled states (`live`, `asleep`, `ended`) all describe a session that still exists. A fourth, *closed*, is nowhere. So the work is to record the ending, then render it. The pattern is already proven next door: `asleep` is documented as *'process killed, **transcript kept**'*, and the transcript is already on disk, already capped at 1 MB, already flushed every 15 s by two writers — nothing ever reads one back except a live terminal. This adds a `ClosedSession` record, a `session-history-store.ts` in `trust-store.ts`'s shape with a 200-cap that evicts the **file** as well as the row (Phase 45 found that exact bug twice), an archive-instead-of-delete `forgetTerminal`, three `mstudio:sessions:*` channels, and a list+transcript view built on `issues-view.tsx` rather than Councils — sessions are flat, not hierarchical. It also fixes two live bugs found on the way: the palette shows `session.title` for every row, which is documented as *'the **repo name**'*, and `state-dot.tsx` paints `exited` identically to `idle`. 42 items, four small themes, no new dependency.

- **[Phase 66 · API Client](phases/phase-66-api-client.md)** (0% · 0/58) — **Planned, not started.** A Postman-compatible API client — the first phase to touch anything HTTP-client-shaped beyond one workflow-scoped `fetch` call — joining the Workspace sidebar group (Explorer/Search/Tests) as a fourth entry. Real `.postman_collection.json`/`.postman_environment.json` import and passthrough-preserving export, a full request builder (params/headers/body across seven content-type modes/auth limited to Bearer/Basic/API key), environments with `{{var}}` interpolation and a gitignored secret overlay, a CodeMirror-based test editor running a pinned `pm.*` subset in a main-process Node `vm` (no full sandbox isolation, no `pm.sendRequest`), and a sequential collection runner with an aggregate pass/fail summary (no data-file iteration). Collections and environments live repo-local under `.midnite/api/`, git-versioned. The HTTP send path reuses the existing workflow `http.ts` executor's cap/timeout pattern verbatim rather than a new package or engine.

- **[Phase 65 · Somewhere for a crash to go](phases/phase-65-somewhere-for-a-crash-to-go.md)** (0% · 0/49) — **Planned, not started.** [Phase 60](phases/phase-60-view-registry-and-error-boundaries.md) builds the error boundaries; this is the place their reports go, because today there is nowhere. The renderer has **no logging channel at all** — `console.error` and `console.warn` return **zero** hits in `packages/app/src`, enforced by `no-console: 'error'`, and there is no `window.onerror`, no `unhandledrejection` and no `componentDidCatch` anywhere. Main's seam is 14 lines (`Logger = (message: string) => void` over `console.warn`) with ~40 call sites writing to a stderr a packaged user never sees — and its own docstring wrongly claims the broker redirects it to a file, when `broker-client.ts:181` only redirects the *child process's* stdio. Nothing in `packages/desktop/src` rotates anything (**0** hits), and main catches almost none of its own crashes: no `uncaughtException`, no `unhandledRejection`, no `child-process-gone`, no `crashReporter`. Fifth fact: there is no **"report a bug"** link anywhere (**0** hits) even though the tracker lives in `bilo-io/midnite-apps` and `release.ts` already holds four URLs into it. This adds levels to the one seam (a callable type with methods, so all ~40 call sites compile unchanged), a rotating NDJSON sink under `userData` following the injected-directory convention every other store uses, an `mstudio:report:*` channel group (**not** `mstudio:diag:*` — already taken by the repo-lint runner), the missing `handleSend` counterpart to `handle.ts`'s four invoke helpers, and two buttons in the Diagnostics accordion that already exists. Home-dir redaction is a deliverable, not a nicety: the "Copy diagnostics" output is designed to be pasted in public. 49 items, five small themes, no new dependency, no telemetry, nothing leaves the machine without a button press.

- **[Phase 64 · Offline Monaco Editor & Cross-Surface Theme Engine](phases/phase-64-offline-monaco-and-themes.md)** (72% · 52/72 · **Refined x1**, [PR #164](https://github.com/bilo-io/midnite-studio/pull/164), [PR #171](https://github.com/bilo-io/midnite-studio/pull/171)) — **Themes A-F landed** (2026-09-05): offline Monaco bundling with inlined workers, the `StudioPalette` cross-surface theme registry (chrome/terminal/editor/Shiki, 6 built-in presets), the writable Monaco editor in the Files view, chord-yielding so Monaco keeps its own keystrokes, a VS Code theme JSON importer, and a "Palette" accordion on the Appearance page with light/dark finally surfaced there too. **Theme G (decommissioning CodeMirror) stays open**, still gated on [Phase 61](phases/phase-61-database-explorer.md) landing its own CodeMirror-based SQL editor first. Replaces the CodeMirror 6 editor in the Files view with a locally-bundled Monaco, and adds a palette layer across the surfaces the app paints code on. The x1 refinement corrected **four premises**, each one grep. `themeMode` in `ui-store.ts` **does not exist** — light/dark is owned by `@bilo-io/ui`'s `ThemeProvider`, persisted at `localStorage['midnite.theme']`, with **four** modes including a `time` mode the plan never knew about. **There is no CSP** (`Content-Security-Policy`, `onHeadersReceived`, `webSecurity` → 0 hits each, and `index.html` already ships an inline script one would break); the real constraint is the `file://` opaque origin from `loadFile`, which is why workers must be `?worker&inline` — the same reason Shiki's WASM already ships inlined. **Theme D was backwards**: the dispatcher is a capture-phase `window` listener calling `stopPropagation()`, so the app already wins every chord and Monaco never sees one — the work is teaching it to yield, plus three native accelerators (`Cmd+G` find-next, `Cmd+L`, `Cmd+O`) that bypass the yield list entirely. And **an Appearance page already exists** whose first accordion is titled "Theme". It also found a **fifth themed surface** — Shiki, pinned to two GitHub themes by a literal return type, painting the read-only preview this phase deliberately keeps plus diffs and slides, so "Monokai" would have left three code surfaces on GitHub — and a **direct conflict with [Phase 61](phases/phase-61-database-explorer.md)**, which states in writing that it uses CodeMirror *"rather than adopting Monaco or a second editor stack"* and builds on the very file this phase replaces; the new Theme G is gated on it. Decision 12 recommends splitting: honestly refined it is 50 deliverables in two halves that share only that Monaco needs a theme.

- **[Phase 63 · The preferences with nowhere to live](phases/phase-63-settings-diff-and-orphan-preferences.md)** (100% · 32/32 · **Refined x1**, [PR #167](https://github.com/bilo-io/midnite-studio/pull/167)) — **Themes A, B, C landed** (2026-09-05): a Settings ▸ Diff page for `diffLayout`, `diffShowOldGutter`, `commitFileView` and `changesFileView` — the two diff controls were only reachable via toolbar toggles that disappear while viewing a binary or deleted file — plus the durable half: `store/persisted-keys.ts` partitions every persisted key into preference vs session state, asserted by a type-level exhaustiveness check and a runtime grep test. **Re-derived at merge time**: the doc's x1 audit counted 71 keys with a 9/25 split of 34 orphans; a sibling PR (#163) landed one more persisted key after that audit, and `sectionFilters` turned out to already be a registered preference rather than session state as the doc's seed table had it — the actual, test-verified partition is 42 preference / 30 session-state keys covering the real 72-key `PersistedUi`. The five-orphan `KNOWN_ORPHANS` allow-list (`browserLayout`, `loopChoices`, `loopAgents`, `loopModels`, `loopSchedules` — Decision 6) and the `*Detached` docblock correction (Decision 7) landed as specified.

- **[Phase 62 · One Escape, one dismissal](phases/phase-62-one-escape-one-dismissal.md)** (0% · 0/33) — **Planned, not started.** Twenty-four hand-rolled Escape handlers, no two of which agree, and no notion anywhere in the renderer of which overlay is on top. `stopPropagation()` on a `window` listener does nothing to sibling listeners on the same `window` — that needs `stopImmediatePropagation`, which appears **zero** times in the codebase — so the two overlays that try to be well-behaved are not, and one Escape dismisses two things by three reachable paths (graph selection + context menu; board card + context menu; a toast over any dialog). `palette-store.ts:115` already names the gap out loud: *"the whole nesting question, avoided in one check."* This builds the answer once — a module-level LIFO stack behind a single `window` listener, delivering to the topmost blocking entry — and folds occluder registration into the same call, which fixes the four blocking overlays currently painted underneath a live `WebContentsView`. 33 items, `packages/app` only, no new dependency.

- **[Phase 61 · Database Explorer](phases/phase-61-database-explorer.md)** (44% · 41/94 · **Refined x1**, [PR #165](https://github.com/bilo-io/midnite-studio/pull/165)) — **Themes A, B, D, E landed** (2026-09-05): the shared contracts (`ConnectionConfig` with no password field, positional `QueryResult`, the `DbOpResult` envelope), a new `packages/db-engine` with Postgres/MySQL/MariaDB/MSSQL drivers and a connection pool fixing the documented `demo-api/server.ts` concurrent-connect race, `desktop`'s IPC + `credential-vault.ts` (this repo's first real `safeStorage` use, with fingerprint-based password revocation), and the Database sidebar entry with a connections list — a reduced connection-dialog built now (Theme F's own item) so the shell has a way to add a connection. **Themes C, F, G, H and I stay open**, and J's dedicated Playwright suites/CI wiring beyond ordinary per-theme tests does too. A DataGrip-style database client behind a new `packages/db-engine`. The x1 refinement found **six wrong premises and one architectural conflict**. The conflict: `better-sqlite3` must load under Node 22 (ABI 127) for bare-vitest tests *and* Electron 33 (ABI 130) in the shipped app, making it the repo's first dual-ABI native consumer — which `rebuild-native.mjs:5-8` explicitly says has never existed here, naming "midnite's dual-ABI staging" as the thing avoided; Decision 6 recommends `node:sqlite` and no native module at all. The largest contract change: **`runQuery` was a plain `invoke`**, which would serialise a whole `SELECT *` through one IPC reply with no cancellation, progress or cap signal — while `stream-registry.ts` (`BATCH_SIZE = 500`, a total `POLICY` record) and `log-service.ts`'s `truncated` flag already solve exactly this, so `'query'` now joins as a `'supersede'` stream and `DbDriver.query` takes a batch callback. The rest: the workbench-store change is architectural, not "entirely in the store's scoping" (no vanilla-zustand precedent exists, and `use-prune-closed-repos.ts` is mounted from `Shell` *specifically* so it runs when Changes is not rendered) — Decision 7 recommends not scoping it at all; `TabStrip` has **neither** the new-tab button **nor** the dirty-dot convention the plan claimed to reuse; `Mod+Enter` is already `status.commit`; `tree-section.tsx` keeps collapsed children **mounted**, a trap `forge-sections.tsx` documents having already been caught by; `BlastRadius` is git-shaped and cannot carry a row estimate; and adding a `ViewId` is **17 sites**, not four — with the render arm needing to sit above the `!selectedRepoId` guard, since a database connection is not repo-scoped. Decision 12 recommends splitting into three phases along the package / IPC / view seams.

- **[Phase 60 · A window that never goes blank](phases/phase-60-view-registry-and-error-boundaries.md)** (0% · 0/34) — **Planned, not started.** Three facts that are one problem: the renderer has **zero** error boundaries against eighteen `lazy()` calls, so one render throw or one 404'd chunk after an in-place reinstall blanks the whole window; the view switch is a 17-branch ternary sitting beside three per-`ViewId` records that already do the job declaratively, which is how `sessions` fell through to a `Placeholder` still pointing users at a `todo/` directory that no longer exists; and six views render no empty, loading **or** error state while both primitives exist with twenty and eighteen consumers. Deliberately small — 34 items, three themes, `packages/app` only, no new dependency, no new IPC channel, no new surface.

- **[Phase 59 · Workspace Optimizer](phases/phase-59-workspace-optimizer.md)** (100% · 70/70 · **Refined x1**, [PR #163](https://github.com/bilo-io/midnite-studio/pull/163), [PR #169](https://github.com/bilo-io/midnite-studio/pull/169)) — **All six themes landed** (2026-09-05): Themes A, B, C, E landed in PR #163 (the feature gate, aesthetic components, Workspace Cleaner with `confineTree` and `trashItem`, and the GPU tab); Themes D and F landed in PR #169 (the Memory tab with circular gauges for Used/Cached/Free memory, 4-segment memory breakdown from `vm_stat`, system-wide process list with search/filter and agent badges, safe process termination with PID-reuse guard and self-preservation deny-list, and full Playwright e2e verification). A CleanMyMac X / macOS System Settings-style optimizer — Smart Scan, Storage, Memory, GPU — pointed at what this app actually owns rather than the whole Mac, gated behind a default-off toggle since kill-any-process and cross-repo deletion are real blast radius. The x1 refinement found **three modules the phase proposed building that already exist**: `metrics/gpu.ts` already probes GPU load and already self-disables in headless/CI (and already rejected the sudo route in Phase 18, which Decision 2 was re-litigating); `agent-process.ts` already runs system-wide `ps` with a parser and fixtures, and its docblock states the exact no-kill posture Theme D reverses; and `format-bytes.ts` already formats bytes, which three themes were reinventing. It also found **one security deliverable the phase never listed**: `fs-scope-write.ts` confines a single final segment under one root and never descends, so a recursive tree delete across repos plus a user-picked root has **no jail at all** — `confineTree` is now a deliverable, delete goes to the trash rather than to nothing, and the scan→confirm→delete TOCTOU window is re-validated. Plus: the chart system's domain is fixed at 0–100 by contract so the storage bar cannot extend it, the gate is seven edits rather than three with no version bump, and the `## Verification` section had **zero** checkboxes, which is how nine deliverables reached a plan unverified. Decision 14 recommends splitting it: honestly refined it is ~70 items with a distinct blast radius in each of Themes C and D.

- **[Phase 58 · Notes, and the menu that holds them](phases/phase-58-notes-and-the-menu.md)** (0% · 0/78 · **Refined x1**) — **Planned, not started.** A thought you have while reading a diff has nowhere to go: every surface in this app is about work that already exists, and nothing catches work that doesn't yet. This phase adds **Notes** — a per-repository list in a centred, gradient-ringed modal on `localStorage`, edited in place — where each note can hand itself to the workflow the repo already runs, in a terminal cwd'd to that repo (typed, never auto-sent), flipping the note to `planned`. The x1 refinement changed the phase's shape twice. **The handoff is already built**: `features/agent/midnite-menu.tsx` already resolves the agent, cwd's the terminal and types-not-sends, and the two skill strings are *user-configurable settings* (`DEFAULT_AGENT_SKILLS`), so the original Theme D would have been a fork that silently ignored anyone who re-pointed them — it is now an extraction. And **the modal count was wrong and so was the diagnosis**: there are twelve `z-dialog` overlays, not seven, ten of them already use `useFocusTrap`, and what they actually get wrong is the occluder pair — **eleven of the twelve are painted underneath a live `WebContentsView`**, which turns Theme B from a tidy into a bug fix. Also reversed: notes are no longer GC'd on repo close (the store it copies declines exactly that), and Theme F's "confirm no native accelerator" became a fix, because `menu.ts:120` registers `CmdOrCtrl+L` today and it fires with a terminal focused.

- **[Phase 57 · Midnite Studio speaks MCP](phases/phase-57-mcp-server.md)** (58% · 44/76 · **Refined x1**, [PR #166](https://github.com/bilo-io/midnite-studio/pull/166)) — **Themes A, B, C, D landed** (2026-09-05): the app is now an **MCP server** — a build-fingerprinted Unix socket under `userData` plus a bundled stdio shim, cribbing the transport trick the pty broker already proved — serving eight read-only tools (`repo.list`, `repo.resolve`, `status.get`, `graph.log`, `diff.file`, `branch.list`, `forge.pulls`, `forge.checks`), every one resolving `repoPath` through `resolveRepoRoot` + the repo registry rather than `fs-scope.ts`. Tool **inputs** are new path-keyed schemas (`McpRepoTarget`) rather than reused `ipc/schemas.ts` `RepoId` extensions — an agent knows a path, never an id — while **outputs** reuse `StatusResultSchema`, `GraphRowSchema`, `RefSchema` and the forge result schemas verbatim; `checksVerdict` was lifted from `packages/app` into `shared` since `forge.checks` needed the identical logic from main. The enable flag lives in a main-side store (`mcp-store.ts`), off by default, with no UI to flip it yet — that plus the deeper path-hardening (symlink/`realpath` comparison, the audit ring) is **Themes E and F, still open**. Read-only and off by default on purpose: write tools need the write queue and a real consent model, and are deferred to a follow-up.

- **[Phase 56 · E2E Suite Speed Run](phases/phase-56-e2e-speed-run.md)** (83% · 24/29, [PR #148](https://github.com/bilo-io/midnite-studio/pull/148), [PR #152](https://github.com/bilo-io/midnite-studio/pull/152)) — **Themes A, B, C, E, F landed** (2026-09-04): 4 → 8 e2e shards (`timeout-minutes` 20 → 10), `fullyParallel: true` (inherited by the CI ratchet config), an `actions/cache@v4` step for Vite's `.vite` dir, and screenshot writes in four functional specs gated behind `MSTUDIO_SHOTS` (verified: a normal run touches zero files under `docs/screenshots/`, `MSTUDIO_SHOTS=1` regenerates all 14 target PNGs). **Theme C measured, no change adopted**: `workers: 2` ran green across 3 full CI runs (24 shard-attempts, zero flake) but averaged ≈4m28s/shard against the `workers: 1` baseline's ≈4m22s — no measured win, so the override was reverted per the doc's own "adopt only on a demonstrated net reduction" rule, with the numbers left in both configs' own comments. **Theme D (retry trim 2→1) was tried and reverted** in PR #148: it passed on the first CI run, but a second full CI run — triggered by an unrelated docs-only rebase, no code change — failed `titlebar-agents.spec.ts`'s "reduced motion keeps a running launcher glow and full opacity" (not in `KNOWN_RED`, reliable across many recent `main` runs) twice in a row, while an exact local reproduction of that shard passed 77/77 clean — the one-run-in-two CI variance the retry budget exists to absorb, reverted to `retries: 2` pending a real fix. Remaining: **G** — extracting a shared `shots-helper.ts` and refactoring the 25 `*-shots.spec.ts` files, left for its own pass given the file count.

- **[Phase 54 · An Issues view](phases/phase-54-issues-view.md)** (96% · 43/45, [PR #121](https://github.com/bilo-io/midnite-studio/pull/121), [PR #122](https://github.com/bilo-io/midnite-studio/pull/122), [PR #126](https://github.com/bilo-io/midnite-studio/pull/126), [PR #128](https://github.com/bilo-io/midnite-studio/pull/128), [PR #130](https://github.com/bilo-io/midnite-studio/pull/130)) — **Theme A landed** (2026-09-04): `ForgeIssueSchema` gains `id` (the ProjectV2 node id, following `ForgePullSchema.id`'s own precedent exactly) and `milestone` (nullable, trimmed to `{ title }` — this schema's established "carry what a consumer needs" convention). **Correction:** `body` and `commentCount` did not land — `body`'s own exclusion is the doc's very next sentence after naming it, and `commentCount` turned out not to be free: `gh issue list`/`gh issue view --json comments` only expose the full comment array (bodies included), never a count, so fetching it for a list row would cost exactly what the doc says a list of bodies should not. **Theme B landed** (2026-09-04): `issueDetail`/`issueComments` in `gh-cli.ts`, new `ForgeIssueDetailSchema`/`ForgeIssueDetailResultSchema` mirroring `ForgePullDetailSchema`'s own split, and `issueComments` reusing `pullComments`' REST path and `parseIssueComments` verbatim — one API call, not two, since reviews are pull-request-only. Also caught and fixed a whole-index guard test (`ipc.test.ts`) enumerating every `forge*` channel against its schema pair, which would otherwise have silently let this land unvalidated. **Themes C and D landed** (2026-09-04): `features/issues/` (`issues-view.tsx`, `issue-list.tsx`, `issue-detail.tsx` — one pane, not tabs — `issue-conversation.tsx`, `label-chip.tsx` with a computed-contrast text color, skeletons, a per-repo `issues-store.ts`), and its registration into the `ViewId` union, rail nav, one `FORGE_GATED_VIEWS` entry, all five exhaustive `Record<ViewId, …>` maps, the layout tables and a `Mod+Shift+I` chord. A self-review pass ahead of push caught two real bugs: `IssueDetail`'s loading gate resolved on the body alone, showing "Nobody has commented" while the comment fetch was still in flight; and a failed `gh issue view` rendered as a silent empty description rather than surfacing its own `error` field. Both fixed, with a regression test added for the second. **Themes F and G landed** (2026-09-04): `IssueActionBar` on the detail pane — "Add to project ▸" reusing `useAddProjectItem` and the board picker `ReviewActionBar` already built, plus comment and close/reopen through two new `forgeIssueComment`/`forgeIssueSetState` channels mirroring the pull-request write surface's own envelope discipline. Both gated on the existing `forgeWritesEnabled` switch — no new gate — which meant correcting the Reviews settings page's own "it never writes to issues" claim, now false. **Theme E landed** (2026-09-04), closing out the phase's build: `filterItems`/`deriveAssigneeCounts`/`deriveLabelCounts` (Phase 52's own `filter.ts`) generalised over a `select: T => FilterableItem` accessor rather than the concrete `ForgeProjectItem` — corrected from the doc's own `T extends FilterableItem` draft once actually written, since `ForgeProjectItem`'s filterable fields sit under a discriminated `.content` union with no flat shape to structurally satisfy. `ProjectsToolbar` lifted out of `projects-view.tsx` into `components/item-filter-toolbar.tsx`, proven reusable by new tests over a plain issue-shaped record with no `ForgeProjectItem` in sight — not yet wired into `IssuesView` itself, which the phase doc's own Verification/Files sections never asked of this theme. A screenshot alongside Phase 52's own `p52-1-table-toolbar.png` shows the Projects toolbar unchanged after the extraction. [Phase 50](phases/phase-50-kanban-projects-followthrough.md) shipped "Add to project ▸" for pull requests only and said why: *"this app has no Issues view … so an Issues entry point has no surface to live on yet."* [Phase 52](phases/phase-52-projects-navigation.md) carried that forward verbatim, and [Phase 19](phases/phase-19-dashboard-actions-tests.md) opened thirty-five phases ago observing there is *"no issues integration whatsoever."* Every theme is built; two Verification bullets stay open for a human pass against a real repo (Add to project on github.com, a live `forgeWritesEnabled` write round-trip).

- **[Phase 53 · The first release](phases/phase-53-first-release.md)** (5% · 3/59 · **Refined x1**) — **Theme A landed; B–H outstanding.** `git tag | wc -l` is still **0**, `bilo-io/midnite-apps` still has **zero releases**, and its `midnite-studio/version.json` still reads `"version": null` — the phase's central premise is intact. The x1 refinement re-verified every other claim after Theme A's merge and found five wrong. **Theme A's own PR created a release-blocker**: the CLI wrapper it shipped hardcodes `echo "midnite-studio 0.1.0"` at line 32, a sixth version site invisible to the lockstep check Theme B is about to build. **The raw updater error is already surfaced** at `updates-page.tsx:92` — the blind surface is the status-bar pill, which returns `null` for both `error` and `checking`. **`updateChannel` is renderer-only** (`localStorage`, `midnite-studio.ui` v8), so "read it at boot" is a design fork rather than a one-liner — main cannot read it at all. **The release skills are far more broken than a stale banner**: they invoke six helpers by name that exist nowhere (`planVersionBump`, `versionFromReleaseBranch` and four more), and `/midnite-release-complete`'s changelog precondition expects a `.date` field from a helper that returns `string | null`, so it cannot pass as written — and the banner itself is duplicated across six files under CLAUDE.md's three-way sync rule. **And the release propagates three artifacts, not two**: the receiving repo's `CHANGELOG.md` is the public mirror the in-app notes popover actually reads, so a release that skips it is installable but mute. All four sibling-app workflow cribs verified real, each with the broken release that taught it — one left a release as an untagged draft.

- **[Phase 52 · Projects, the Board, and Workflows, navigable](phases/phase-52-projects-navigation.md)** (93% · 40/43, [PR #116](https://github.com/bilo-io/midnite-studio/pull/116), [PR #120](https://github.com/bilo-io/midnite-studio/pull/120)) — **All seven themes landed.** Themes A–D (2026-09-04, PR #116): one filter toolbar shared by Table and Board (search plus assignee/label/type/state facets), grouping generalised off the literal `Status` match to any `single_select` or `iteration` field (iteration read-only, folded into the existing write-gate with a named reason), tri-state sortable table columns (option order for `single_select`, `title` for iteration — the value schema carries no start date), and all of it — plus column collapse — persisted keyed by `projectId` rather than `repoId`, LRU-bounded. Along the way, found and fixed a real gap in `e2e/projects.spec.ts`'s own fixture (missing `body`/`labels`, the same class of bug `kanban.spec.ts` had already hit once). Themes E–G (2026-09-04, PR #120): the Workflows list and run history learn to filter, reusing Theme A's components verbatim; `workflows-view.tsx`'s right-hand region becomes a real `panel-stack` (Inspector → History → Run) via a `WorkflowPanelEntry` union — the primitive's first heterogeneous consumer; and the kanban board gets roving-tabindex keyboard navigation, catching along the way that `useDraggable`'s own attributes default `tabIndex` to `0` for a keyboard sensor this app never wires (a second Tab stop, overridden) and that collapsing the *focused* card's own column needs an immediate focus rescue, not just one on the next arrow press. Three human-only verification passes stay open: a mouse-untouched keyboard sweep, the global `Mod+[` chord reaching the new Workflows panel-stack, and a real github.com board. The filtering, grouping and sorting Phases 40, 41 and 50 each put out of scope in the same words. The Projects view today has no search box, no facet, no sortable column and exactly one grouping — a single-select field matched by the **literal string `Status`**, so a board organised around "Priority" renders an EmptyState. The phase is small because none of it needs the network: every value it filters, groups and sorts on is already client-side on `ForgeProjectItem.fieldValues`, `deriveColumns` already takes its grouping field as a parameter (only its caller is hardcoded), `MultiSelectMenu` already carries the house "empty means everyone" convention, and `FilterInput` exists with **zero consumers** — this is its first. Seven themes: **A** one filter toolbar shared by Table and Board, keeping the 1000-item truncation honest under a filter; **B** group by any single-select or iteration field, with iteration read-only because its write payload differs and iteration writes stay out of scope; **C** tri-state sortable columns whose single-select comparator follows option order, not the alphabet; **D** that view state persisted **keyed by `projectId`, not `repoId`** — the trap being that the items query key is already repo-agnostic and one project is reachable from several repos; **E** the Workflows list learning to filter, as the cheapest proof Theme A built a pattern; **F** Workflows finally adopting `panel-stack`, the consumer that primitive's own docblock has named since Phase 42; **G** the board becoming keyboard-navigable, with focus rescued rather than lost when a filter hides the focused card. No new IPC channel, no `gh-project.ts` change, no schema change — a diff touching them means a theme drifted.

- **[Phase 51 · The terminal, made steady](phases/phase-51-terminal-steadiness.md)** (84% · 31/37, [PR #115](https://github.com/bilo-io/midnite-studio/pull/115), [PR #117](https://github.com/bilo-io/midnite-studio/pull/117), [PR #118](https://github.com/bilo-io/midnite-studio/pull/118), [PR #119](https://github.com/bilo-io/midnite-studio/pull/119), [PR #123](https://github.com/bilo-io/midnite-studio/pull/123), [PR #131](https://github.com/bilo-io/midnite-studio/pull/131)) — **Theme G landed** (2026-09-04, PR #131), closing out the phase's build: `sessionPhase()` stops folding a legacy broker session into `asleep` — a legacy peer with a bound pty is a real running process, not dormant, so it now falls through to the ordinary `live` branch, with the session-list moon glyph kept as a provenance mark rather than a state mark. The reattached status-bar note is now clickable, revealing the first reattached session through the existing `reveal-session.ts` path. The dead `attach` wire message — declared with no handler, always answering `{ok:false,'protocol'}` — is deleted from `protocol.ts`'s union. Six Verification bullets stay open for a human pass (real displays, a real relaunch, real megabyte pastes) — every theme A–G is built. **Theme C landed** (2026-09-04, PR #123): `xterm-budget.ts` rations WebGL contexts process-wide by visibility recency (`MAX_WEBGL_CONTEXTS = 12`), fed by every `TerminalView`'s existing `active` prop — no call-site change in the panel, card or FAB tab — replacing `card-terminal-mounts.ts`'s card-only `MAX_CARD_TERMINALS` cap outright, since the new registry rations the identical resource with a strictly better failure mode (degrade to DOM, don't refuse to mount). A lost context retries once immediately rather than degrading permanently, and `Settings ▸ Terminal` gains a Renderer readout. **Caught by CI, not review:** the first cut deferred WebGL acquisition to a reactive effect running after the initial fit, so that fit measured DOM-renderer metrics and the WebGL renderer's own slightly different ones arrived moments later with nothing re-fitting — read as a genuine size change and sent one spurious extra resize, caught by `terminal-reveal.spec.ts`. Fixed by moving acquisition back inline, before the first fit, exactly as the pre-Theme-C code ordered it. **Theme F landed** (2026-09-04, PR #123): a new `broker/socket-write-queue.ts` honours `socket.write()`'s ignored `false` return with a bounded, drain-aware queue at both cited hops (`broker-client.ts`'s `writePty`, `server.ts`'s `broadcastControl`); a failed `pty.write` now logs through the broker's log seam instead of an empty catch (the renderer still learns via the existing `pty.onExit` path); a zod-rejected `ptyInput` payload logs through main's log seam instead of vanishing. **Theme A landed** (2026-09-04): a new `useDevicePixelRatio()` hook (`matchMedia` re-armed at the new ratio on every change, since the query embeds the old one and only ever fires once), wired into `terminal-view.tsx` as a `webglRef`-gated `clearTextureAtlas() → fit() → refresh()` sequence — the DOM-renderer fallback gets the fit/refresh half with no atlas call. Tests scoped to the hook itself, per the doc's own plan; the wiring needs a live xterm + WebGL context no jsdom test can construct, same reason `terminal-view.tsx` has no test file of its own. **Theme B landed** (2026-09-04): a `terminal-font.ts` builder resolving font family/size/line-height (plus two fixed, repo-owned metrics) into a complete xterm options object, wired both at construction and as a live-apply effect so a `Settings ▸ Terminal ▸ Appearance` change reaches every already-mounted terminal without a remount. The fixed metrics match xterm's own defaults, so this is a no-visual-regression write-down, not yet the fix for the uneven baselines themselves — closer to Theme C's WebGL story. **Theme D landed** (2026-09-04): a `fit-coalescer.ts` wrapping `safeFit()` so the resize `ResizeObserver` runs at most one measure-and-reflow per animation frame, instead of one per observation during a drag-resize — `lastSentRef`'s own IPC-resize dedupe stays untouched, since it solves a different problem one layer down. Cancelled (not "flushed", per the doc's own draft) on unmount, since running a queued fit against a container mid-teardown serves no purpose. **Theme E landed** (2026-09-04): `input-queue.ts`'s bounded FIFO buffers a keystroke typed while `stateRef.current` still reads `'starting'` — the race window between `pty.create` resolving and this component's own re-render catching up — flushed through the same `sendInput` path the instant `connectionState` is observed `'open'`, so a queued byte can never be overtaken by a live one. `Cmd+Enter`'s `\x1b\r` routes through the same gate. **Scope trim:** no pane-level "overflow" mark — the drop-oldest cap is a defensive backstop for adversarial input, not a case real typing speed against real pty-startup latency actually reaches. [Phase 30](phases/phase-30-terminal-hardening.md) made the terminal *survive*; it did not make it *steady*. A read of the subsystem found a concrete cause behind each of the three standing complaints rather than a suspicion. **Jagged text**: `devicePixelRatio` is never read anywhere in this repo — no `matchMedia` resolution query, no display bridge — so the WebGL glyph atlas stays rasterised at the DPR in force when the addon loaded, and `safeFit()` cannot rescue it because it early-returns when cols/rows are unchanged, which a display change at a constant window size leaves them. Compounded by `fontSize: 12` with **no `lineHeight`**, so xterm computes a fractional cell the renderer rounds per row. **Panes that look different from each other**: `webgl.onContextLoss(() => webgl.dispose())` and nothing ever re-adds it, against a Chromium cap of ~16 contexts per process that `MAX_CARD_TERMINALS = 4` budgets for Kanban cards *only* — panel sessions and FAB loop tabs spend from the same ceiling untracked, so some panes are silently on the DOM renderer. **Buggy input**: `onData` reads a `stateRef` assigned during render, so between `pty.create` resolving and the next render it still says `'starting'` and the keystroke is **dropped with no queue**; and there is no backpressure at any hop — `socket.write()`'s return is ignored on both sides, there is no `'drain'` handler, and a failed `pty.write` is swallowed by an empty catch. **Reattach**: sessions genuinely survive a relaunch, but `sessionPhase()` folds `legacy` into `asleep` so a running shell is presented as dormant, and `attach` is **dead protocol** — declared on the wire, no `case` in the handler, answering `{ok:false,'protocol'}`. Seven themes fix the causes: a DPR watcher with clear-atlas → fit → refresh (**A**), explicit cell metrics plus live-applied font settings (**B**), WebGL re-acquisition and a process-wide xterm budget every mount site reports to — the one Phases 41 and 50 each declined (**C**), a rAF-coalesced fit (**D**), a bounded pre-ready input queue that drops oldest-first (**E**), drain-aware writes on the input direction (**F**), and a previous run's session opening as a live pane with `attach` deleted rather than implemented (**G**).

- **[Phase 50 · Kanban & Projects, Follow-Through](phases/phase-50-kanban-projects-followthrough.md)** (88% · 15/17, [PR #93](https://github.com/bilo-io/midnite-studio/pull/93), [PR #101](https://github.com/bilo-io/midnite-studio/pull/101)) — **Themes A-F landed** (2026-09-03). Six gaps Phases 40-42 each named and declined. **A**: a card session outlives its agent — the binding survives the exit and renders `Ended` with the scrollback still reachable, cleared only by an explicit Dismiss (`dismissCardSession`, which drops `surface`/`taskRef` exactly as `rehomeSession` does rather than killing a session that may still be live), plus a soft *warning* at 5 concurrent card sessions on one board — never a block, which is what Phase 41 Theme I's own recorded recommendation argued for. **B**: "Launch and run" as a second button beside Start, invisible behind a default-off `Settings ▸ Projects` toggle and, even on, confirmed every time against the verbatim composed command — both paths funnel through one `launch(autoSend)` so the only difference between them stays the trailing `\r`. **C**: `clearProjectV2ItemFieldValue` finally makes "No status" a real drop target instead of the permanently-disabled column Phase 41 Theme C had to leave it as — clearing a field is a *different* GraphQL mutation, which is exactly why it was deferred, and both the drag path and "Move to ▸" now route to `clearField` rather than `setField`. **D**: the card-detail pane adopts `panel-stack` (`Mod+[`/`Mod+]`, a breadcrumb), the consumer #2 that primitive's own docblock named — one `usePanelHistory` per open pane (reset on close, no module-level store), joining Councils in `active-panel.ts`'s registry. Self-review caught three real defects before merge: `CardComposer` state bleeding between cards on a panel-stack push, a board freeze on a no-op move, and the stack's own selection drifting out of sync with the board's. **E**: "Add to project ▸" on a PR's Reviews detail pane, reusing the existing board picker and `addItemToProject` — the `id` field the mutation needs turned out to be missing from `ForgePullSchema` entirely, threaded through `gh-cli.ts`/`gh-parse.ts` to get it. **F**: activity markers captured from real sessions for `agy` and `opencode` (braille spinner + text tells for `thinking`, a distinct idle-only string for `frameEnd`); `codex` stays unset — it needs an interactive `codex login` this pass had no business driving unattended, honestly noted rather than guessed. Three human-only verification passes stay open: the live "No status" clear on a real board, "Add to project" landing on github.com, and a non-Claude agent's live activity transition (plus a `codex` transcript once logged in).

- **[Phase 49 · Onboarding a repo: Setup and Update](phases/phase-49-repo-onboarding.md)** (94% · 31/33, [PR #51](https://github.com/bilo-io/midnite-studio/pull/51), [PR #104](https://github.com/bilo-io/midnite-studio/pull/104)) — **Themes A-E all landed** (2026-09-03): `templates/midnite/` ships as a checked-in skeleton (the tracker, eight genericized skills mirrored into `.claude`/`.agents`/`.codex`, agent-file stubs), packaged via `electron-builder.yml` + `template-path.ts`'s dev/packaged resolver, and `midnite-setup/SKILL.md` (found drifted across its own three mirrors) now emits this same tree instead of a hand-described `todo/` layout. Themes B (the scaffold contract), C (the plan/apply engine) and D (the Setup dialog) landed alongside it. Theme E (Update + menu wiring) closes out its last two items: a pre-flight tooltip naming the multi-minute/~200MB cost when no packaged build exists yet — surfaced only in the title-bar `buttonLabel`, not a `ContextMenu` `description`, since that component's own rule is every row of a menu is described or none are, and this menu's rows are all undescribed today — and a packaged-build assertion for Theme A's own named risk, landed in the existing `verify-dist.mjs` (already running in CI's `package` job) rather than a new script or CI job. **The midnite menu's first two entries about the repository itself, rather than about an agent working in it.** The menu has had one shape since it was built — five groups, eighteen leaves, every leaf typing a command into a terminal via `startAgent` and stopping before Return — and only one of these two can keep that posture. **Setup is net-new, and the audit says how new:** nothing under `packages/` or `scripts/` has ever read or written a `.midnite/` directory, and the closest prior art is not code but [`midnite-setup/SKILL.md`](../../.claude/skills/midnite-setup/SKILL.md), **stale by a rename** — it still scaffolds `todo/`, the name the tracker abandoned. So the kit becomes a checked-in `templates/midnite/` skeleton (deliberately not a snapshot of this repo's 1.8 MB of real phase docs), carrying the tracker, eight repo-agnostic skills — `midnite-release-*` excluded on a real argument, since it assumes the `midnite-apps` repo, the namespaced tag scheme and the `generic` feed — agent-file **stubs** rather than copies of 199 lines of this repo's own conventions, and the `.agents`/`.codex` mirrors each CLI reads by its own rule. A **hash manifest** in `.midnite/settings.json` is the one piece of persistent state, and it is what makes a re-run an upgrade instead of a guess: create / unchanged / stale / locally-edited, with a `.midnite/` that predates the manifest classified **locally-edited wholesale**, because absence of provenance is not permission. Writes ride Phase 24's existing `fs-scope-write.ts` confinement against the *target* root — no second primitive — and the manifest is written last, so a crash mid-apply leaves a target whose next plan reads the truth off disk. **Update is misnamed, and the phase says so:** [`install-local.mjs`](../../packages/desktop/scripts/install-local.mjs) takes no repo, it `ditto`s **this** checkout's `release/mac-arm64` build into `/Applications`, so the leaf detects `isMidniteStudioCheckout` by a real marker (not a directory name, so clones and worktrees resolve) and disables itself with a `disabledReason` everywhere else — the first repo-capability use of fields `context-menu.tsx` has carried all along. It **types, it does not execute**: a multi-minute `dist` that ends by replacing the `.app` under the running process, in front of a pty broker keyed on a build fingerprint, is not something to automate. No git touched in the target, no content merging, no Onboarding view, macOS only.

- **[Phase 48 · Apply suggested-change blocks](phases/phase-48-apply-suggested-changes.md)** (95% · 19/20, [PR #51](https://github.com/bilo-io/midnite-studio/pull/51) + [PR #62](https://github.com/bilo-io/midnite-studio/pull/62)) — **Themes A–E landed.** `extractSuggestion(body)` (Theme A, PR #51) walks the same mdast tree `deck-parser.ts` already builds for a ` ```suggestion ` fence anywhere in the body, depth-first in document order. Themes B–E (PR #62, 2026-09-03) finish the phase: `suggestionLineRange(thread)` resolves the 1-indexed range a suggestion replaces off `startLine`/`line` (`RIGHT`-side only — Apply is never offered at all on a `LEFT`-side thread); `checkSuggestionApplies`/`expectedRightSideText` compare the local file's current content at that range against what the PR's own diff says is there, independent of `fsWriteFile`'s own `expectedVersion` check, failing closed on any mismatch, unverifiable gap, deleted file, or already-`outdated` thread; `comment-thread.tsx`'s `CommentBody` renders a `suggestion` fence as a struck-through/added preview (`slide-code.tsx`'s `language-(\w+)` pattern, `DiffCell`'s own add/del tokens) with an Apply button disabled — reason as its `title` — before any click; Apply rides Phase 24's existing whole-file `fsWriteFile` (no new write channel) and never auto-stages, auto-commits, or resolves the thread, exactly [Phase 47](phases/phase-47-conflict-resolution-studio.md)'s settled posture for an externally-suggested change landing on disk. A real defect was caught in review: `spliceSuggestion` was rejoining a CRLF file's *untouched* lines with a bare `\n` too, silently flattening the whole file's line endings on every Apply — fixed to preserve the file's own ending. **One item stays open by design** — Theme E's human-only pass, applying a real github.com suggestion against a real checkout to confirm line endings/encoding survive (no fixture can prove that against GitHub's actual payload shape).

- **[Phase 47 · Conflict Resolution Studio](phases/phase-47-conflict-resolution-studio.md)** (96% · 22/23, [PR #63](https://github.com/bilo-io/midnite-studio/pull/63) + [PR #64](https://github.com/bilo-io/midnite-studio/pull/64) + [PR #103](https://github.com/bilo-io/midnite-studio/pull/103) + [PR #107](https://github.com/bilo-io/midnite-studio/pull/107) + [PR #111](https://github.com/bilo-io/midnite-studio/pull/111) + [PR #133](https://github.com/bilo-io/midnite-studio/pull/133)) — **Theme E landed** (2026-09-04, PR #133), closing out the phase's build: a "Suggest a resolution" button per conflict region reuses Phase 34's `mstudio:council:run:start` unchanged — no new IPC channel — composing a prompt from that region's ours/base/theirs text plus up to 8 lines of context on each side, run through whichever council the Councils view was last on (a `<select>` picker, falling back to the first council that exists). The response renders as advisory text beside the region, never pre-selecting or auto-applying a side; Theme D's Accept mine/theirs/both actions sit unchanged right beside it. **Scope trim from the doc's draft:** no parsing of the free-text response into a specific recommended side to pre-fill — the response is arbitrary council prose, and a reliable side-extraction would need a second, constrained run for a benefit the advisory text already delivers by being read before any click. One item stays open for a human: a real conflict against a locally-set `merge.conflictStyle = diff3` (Theme F). **Theme F landed, partial** (2026-09-04, PR #111): `conflict-flow.integration.test.ts` (real git via `TempRepo`) proves what Themes B and C's own isolated suites couldn't — that mixing a whole-file accept and a region-by-region session in the SAME merge reaches `conflictedPaths()` empty and a real completed two-parent merge commit through `continueOp`, and that both write paths agree with EACH OTHER about which side is "ours" inside the same rebase. New RTL coverage also closed a real gap: "Accept theirs"/"Accept both"/"Accept all theirs" had no payload-asserting test before this pass — only "Accept mine"/"Accept all mine" did, so a swapped button handler on any of the other three was invisible to every existing test. **Checked for a reusable "real git behind the UI" test harness first and found none** — every Playwright spec here drives the renderer against a mocked bridge — so this landed as a git-engine integration test rather than new Electron-in-the-loop infrastructure disproportionate to an `S`-sized theme. **Open, for a human**: a real conflict against a locally-set `merge.conflictStyle = diff3`. On top of **Theme D** (PR #107): the Studio UI, resolving a conflict without leaving the app — see `done.md` for the full account. **Theme C** (PR #103): `applyConflictHunk`, hunk-level patching, corrected mid-build to worktree-only. **Theme B** (PR #64) and **Theme A** (PR #63): the whole-file baseline and the marker parser. **The gap left open since [Phase 8](phases/phase-8-drag-drop-ops.md), and declined on purpose by [Phase 26](phases/phase-26-side-by-side-diffs.md)**. Every theme A–F is now built; Theme F's real `diff3` pass is the only item left open, for a human. No manual free-text editing, no `rerere`, no binary/LFS/submodule conflicts — the Studio picks a side, it does not become an editor.

- **[Phase 46 · The lock screen, and a motion policy that holds](phases/phase-46-lock-screen-and-motion.md)** (76% · 37/49, [PR #55](https://github.com/bilo-io/midnite-studio/pull/55) + [PR #63](https://github.com/bilo-io/midnite-studio/pull/63)) — **Theme G landed** (2026-09-03, PR #63): `lock-screen-shots.spec.ts`, a committed `MSTUDIO_SHOTS`-gated spec shooting the full lock screen across both motion modes and both themes, closing out the phase's build half — only the `## Verification` section's human keyboard/eye passes stay open. On top of Themes A and C ([PR #55](https://github.com/bilo-io/midnite-studio/pull/55)), and Themes B, D, E, F ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)). Theme A: a new `features/weather/` module shaped like `features/finance/`, Open-Meteo (keyless) for geocoding and forecast, WMO codes mapped to existing `react-icons/lu` glyphs, slotted top-centre via Theme D's corner layout — renders nothing until a location is set and nothing on a fetch failure. Theme C: the four count pills became real, keyboard-reachable buttons with a destination each (`repos`→reveal the repos panel, `agents`→reveal the terminal, `myPRs`/`teamPRs`→Reviews — corrected from the doc's `setActiveView('repos')`, since there is no `'repos'` `ViewId`), holding their destination across the passcode pad and dropping it on cancel. **Found only by testing in a real browser**: `LockScreen`'s own "any key opens my dialog too" listener doesn't know about the pill's own passcode dialog, so typing the pill's code used to also pop a second, redundant dialog underneath it — fixed with a new `suppressUnlockTrigger` prop; and the pill's dialog, first tried as a sibling portal, sat under `LockScreen`'s own backdrop and ate every click — fixed by nesting it in `LockScreen`'s children instead. Theme G (screenshots in both motion modes, `ControlOrMeta` coverage) remains `◐ PARTIAL` — its unit-test bullet is satisfied by this batch. **The last two entries in [`_features.md`](../_features.md), and with them the file is empty.** The numbered list became 40–44, Improvements #2 went to [Phase 36](phases/phase-36-performance-diet.md) and #1 to [45](phases/phase-45-leak-audit.md); what remains is the whole **Lock Screen** section and Improvements #3, and they turn out to be the same surface. `features/screensaver/` is **1 344 lines across seven files that no phase doc has ever named** — a scan of all 45 returns zero hits for "lock screen", "screensaver" or "weather" — which is exactly where the FAB stood before [35](phases/phase-35-fab-mission-control.md): built ad hoc, working, untracked, drifting. It is also the app's densest animation, which is why the motion half belongs here. **Reduced motion has never been a theme of its own** — [37 F](phases/phase-37-fab-tab-glow.md), [39 G](phases/phase-39-status-bar-shortcut-rail.md) (still `◐ PARTIAL`) and [42 F](phases/phase-42-councils-layout.md) each carry it as a trailing **(S)**, and three phases ending on the same unfinished item is a policy with no owner and no test. Reading the tree produced the proof before any work started: **`@keyframes pill-shimmer` and `.pill-shimmer` are each declared twice** — byte-identical bodies at `styles.css` 143/152 and 539/548 — **with a different motion guard on each copy**, and two guard dialects coexist across 16 keyframes that are *not* equivalent, since `html[data-motion='reduced']` matches only a resolved attribute while the `@media` form honours the OS and still lets `Motion: full` opt back in. Underneath that, **two hooks write `data-motion` and only one of them resolves `'system'`** — the store's own default — so which value lands is effect-order dependent, and Theme E's first job is to go and look. The build half is mostly **reuse rather than invention**: battery already rides the metrics sample with `features/battery/` shipping the icons and panel, and weather clones `features/finance/`'s react-query shape down to the trap that file already documents (the global `staleTime: Infinity` is wrong for live data). The one thing that must not ship wrong is Theme C's: a pill clicked behind a passcode has to hold its destination across the pad, apply it on unlock and **drop it on cancel** — anything else is a lock-screen bypass. Theme F is what stops the whole thing rotting: a unit test failing the day a `@keyframes` arrives unguarded. Renderer-only by construction — no IPC, no main, nothing near `git-engine`.

- **[Phase 45 · The leak audit](phases/phase-45-leak-audit.md)** (91% · 32/35, [PR #51](https://github.com/bilo-io/midnite-studio/pull/51)) — **Themes E and F landed** (2026-09-03): the six leaks Theme B found, one commit each, plus Theme F's own verification run — which itself found and fixed two real issues in the harness (`memory-report.mjs` never re-exported the helpers `retention.spec.ts` needs, so the spec had never actually run before this pass; and `browser-tabs` at 10 cycles read a false-positive leak that Chromium's own subprocess-pool warm-up explains, confirmed by hand at 20 cycles). One human-only long-running-session pass stays open. **Improvements item 1 in [`_features.md`](../_features.md), and the sequel [Phase 36](phases/phase-36-performance-diet.md) left open by name.** That phase's own [`scripts/perf/README.md`](../../scripts/perf/README.md) carries a section titled *"What is not measured here"*, and renderer heap is in it: *"a heap number without the diff that produced it is not comparable to anything."* Correct — and it is why nothing has been measured since. So this phase turns the last human-only metric into a script with a budget, and the budget is a **slope** (bytes retained per cycle) rather than a level, because a leak is growth, not size. Phase 36 Theme F already swept `packages/app/src` and is not repeated; **`packages/desktop` has never been audited at all** — 35 top-level `Map`/`Set` allocations, six intervals, a `WebContentsView` map, a pty map, watchers and a socket client. A sweep found **six real leaks**, and `git-engine` clean throughout (bounded LRUs with TTLs everywhere). The headline is the broker's `scrollbackBySession`: **2 MB per terminal session, never deleted**, in the one process that *deliberately outlives the app* — `before-quit` detaches rather than kills, which is the Phase 30 guarantee — so it grows across restarts and is re-walked every 15 s writing files for sessions that ended long ago. Next is a cap applied in exactly one of the two places it is needed: `MAX_STORED_RUNS` trims the copy written to disk and is never assigned back to the in-memory array, at ~500 KB per council member per run, with `loop-runs.ts` repeating it verbatim. Nothing here ships in the product — measurement stays dev-side, reading `ps` from outside, with one narrow and argued exception.

- **[Phase 43 · Workflows](phases/phase-43-workflows-mvp.md)** (71% · 55/77, [PR #92](https://github.com/bilo-io/midnite-studio/pull/92), [PR #100](https://github.com/bilo-io/midnite-studio/pull/100), [PR #102](https://github.com/bilo-io/midnite-studio/pull/102), [PR #105](https://github.com/bilo-io/midnite-studio/pull/105), [PR #108](https://github.com/bilo-io/midnite-studio/pull/108)) — **Themes A–I built** (I partial — one human pass stays open). The contract, a topological engine, five executors and a real local CRUD API to run them against (A–D, PR #92), joined by a hand-rolled SVG canvas — pan/zoom, raw-pointer node drag with grid snap, edge creation with draw-time cycle rejection via a `findCycleEdge`/`wouldCycle` pair hoisted into `shared` so the canvas and the engine can't disagree about what a cycle is, marquee/shift-select, undo/redo, and viewport culling (E) — plus the list/persistence renderer half: `workflows-view.tsx` replacing the `<Placeholder>`, create/duplicate/delete/import-export, and `noBridge`/`reportFailure` hoisted out of the councils hooks (H). Three things are copied from [`council-runner.ts`](../../packages/desktop/src/main/council-runner.ts) verbatim because Phase 34 already paid for the lesson: `withRunLock` (parallel node settles racing a read-modify-write is that exact bug), the rule that **locked sections never nest** — which is what dictates the driver's shape, mutate under the lock and start the next node outside it — and the frozen run snapshot, so editing the graph mid-run cannot rewrite history. A cycle is rejected **before the first node launches**, named against its edge, because Kahn's algorithm is run for its *remainder* rather than its order. The 120 s per-node deadline rides an **injected clock seam** rather than `vi.useFakeTimers`, which fights the real promise scheduling around `fetch`/`await`. Two counter-intuitive rules are written into their docblocks: **a non-2xx is `ok: true`** (a 404 is a result a downstream `condition` interprets; only a transport failure or the deadline fails a node) and **an unresolved `{{a.b}}` fails the node** rather than substituting empty — silent substitution is how an HTTP node quietly POSTs `undefined` for a week. The demo API binds `127.0.0.1` and `listen(0)`, never `0.0.0.0` and never a fixed `:7331`, and doubles as the executor suite's fixture so that whole file passes **with the network cable out**. **F** adds the canvas's first right-hand config pane — forms dispatched exhaustively off `WorkflowNode['kind']`, live validation reusing the existing `validateWorkflow()` (a bare zod parse would catch nothing an empty URL needs), and a `{{...}}` reference helper listing an ancestor's declared output fields, inserted at the focused field's caret. **G** reuses that same canvas read-only, coloured by a run's per-node status and kept live by push-then-re-fetch off `workflowRunChanged` rather than councils' polling; a run's own detail swaps into the inspector's pane, history is a Popover off the toolbar (not a `panel-stack` drawer), and the running indicator borrows `BoardView`'s `.card-run-glow`/`useWindowFocusGate` pairing rather than the heavier tab-hued `.loop-run-glow` system the doc named. **I** closes the palette (`workflow.run`, which needed `PALETTE_SAFE`'s own allowlist as well as `COMMANDS` — an e2e run against the real palette caught the miss) and adds the Workflows settings page, wired all the way to main over a new one-way `workflowSetDefaults` channel (the `update.setChannel` shape) rather than left cosmetic — the default node timeout and the run-history cap now actually change what a run does. One human-only pass (a real demo-API round trip) stays open, plus D's demo-API pill.

- **[Phase 44 · Video Studio](phases/phase-44-video-studio.md)** (92% · 59/64, [PR #110](https://github.com/bilo-io/midnite-studio/pull/110), [PR #112](https://github.com/bilo-io/midnite-studio/pull/112), [PR #113](https://github.com/bilo-io/midnite-studio/pull/113), [PR #134](https://github.com/bilo-io/midnite-studio/pull/134)) — **Themes D, E, G landed, F and H partial** (2026-09-04): the Video view itself — a new `ViewId` touching eight files, three panes (projects left, studio centre via the browser pane's own `use-browser-bounds`, detail right), six centre-pane states (a "select a project" `EmptyState` beyond the five originally enumerated), lazy behind the same Suspense boundary as every other view. Renders (Theme E) close out: the output pane lists `output/vN-*.mp4` with size and mtime, `output/CHANGELOG.md` renders through the existing markdown pipeline, and reveal-in-Finder/play-in-default-app land through a **new, video-scoped** `shell` hand-off (`mstudio:video:file-reveal`/`file-open`) rather than the existing repo-scoped `mstudio:shell:show-item-in-folder` — a video root is neither a repo nor registered anywhere, so that channel's `FsRepoScope` request shape couldn't be reused without widening it for one caller; the new pair re-confines `{area, projectId, name}` against the video root itself, the same distrust `videoProjectReadFile` already applies. Assets (Theme G) share that same `video-file-list.tsx` listing for `assets/`/`input/`, reusing only `FileIcon`/`FolderIcon` rather than the explorer's writable `FileTree`. Claude actions (Theme F) land — Write/Execute editorial script, type-don't-send, **deliberately not** routed through Phase 35's `DEFAULT_AGENT_SKILLS` (that store's menu always launches with the currently open repo's `cwd`, which would silently run these in the wrong directory for a project that isn't repo-scoped) — with two recorded gaps: no skill-presence check against the video root, and `BRIEF.md`/`EDITORIAL_SCRIPT.md` stay read-only rather than opening in the existing editor. Theme H's wiring (handlers, preload, `use-video.ts`, a `view.video` command, a Settings entry, `before-quit` process cleanup) lands, with a recorded gap on per-project/per-action palette entries — project *selection* lives in `VideoView`'s own local state, not reachable from the palette's `createReposSource`-style pattern without lifting it to a store first, a bigger prerequisite than this pass took on. `moon run app:perf`'s bundle assertions were re-verified directly (`bundle-report.mjs --assert` against a rebaselined `budgets.json`, plus grepping the built manifest) rather than through the full Playwright suite. `mock-bridge.ts` gains `video.*` fixture support and a real e2e spec plus screenshots — which caught a real bug: a fixture pre-seeding a project's studio as already `failed` never reached the UI, since `useVideoStudioStatus`'s `initialData` plus `app.tsx`'s global `staleTime: Infinity` mean the first real status fetch never runs on mount; fixed to route through `studio.start`'s own response instead, the same path production uses. Theme C (toolchain probe / studio host) closes out too, its own last open item (`before-quit` process cleanup) landing with Theme H. **Open, for a human:** a real interactive pass against `~/Dev/ekko-videos` with `ps`-checked process cleanup on cancel and on quit. **Theme A landed** (2026-09-04): `shared/src/video.ts`'s five schemas — `VideoProject` checked directly against `ekko-videos`' own `project.json` rather than guessed, `VideoStudioStatus` schema-enforcing that `running` always carries a URL and `failed` always carries stderr lines, `VideoToolchain`'s `found`-discriminated binary pair — plus the `mstudio:video:*` channels, two push events, and `bridge.ts` signatures. Confirmed a contracts-only theme genuinely stands alone here too: `app`/`desktop` typecheck green with no `video` property in `preload/index.ts` at all yet. **Theme B landed** (2026-09-04): projects discovered (never registered) by scanning `<root>/projects/*/project.json`, jailed under the root through the existing `fs-scope.ts`; a one-field `projects-store.ts` for the root path itself. Test-driven, and the tests earned their keep — caught a containment check that wrongly rejected a fresh project's not-yet-created `source`/`brief`/`script` files, a `readdir` `Dirent` quirk that silently dropped a symlinked project folder instead of refusing it, and an error-message conflation between "missing" and "escapes the root". **Themes C and E landed, partial** (2026-09-04): a toolchain probe and a `remotion studio` host (port read off stdout, never assumed 3000; a dead studio reports `failed` with its stderr and stays restartable), and a queued-per-project render service riding the existing `process-runner.ts` at a 20-minute deadline, preferring a project's own `render.mjs` wrapper and parsing Remotion's own CLI text for progress (weighted 70/30 render/encode, the same split `@remotion/renderer` uses internally — Theme A's landed event schema carries no `phase` field, so this is one fraction, not an enum). Both stay decoupled from Theme B's store by taking a directory as a parameter; the before-quit kill wiring and the output-listing pane are left open for Theme H and Theme D respectively, once a view exists to drive them. **The last unclaimed item in [`_features.md`](../_features.md).** Items 1–4 became Phases 40–43; this is item 5, and with it the feature list is fully planned. A **Video** view that turns a brief into a rendered video — Remotion draws, Claude writes — modelled on the working [`~/Dev/ekko-videos`](file:///Users/bilolwabona/Dev/ekko-videos) repo, whose README is explicitly "the playbook for repeating the process". Its one load-bearing decision is that **this app ships no Remotion dependency at all**: [`electron-builder.yml`](../../packages/desktop/electron-builder.yml) puts only two esbuild bundles in the asar, and `@remotion/renderer` needs ~210 MB of on-disk binaries (a 193 MB `chrome-headless-shell` plus a 17 MB Rust FFmpeg compositor) against a dmg whose entire native payload today is dugite's 42 MB of git. So a video project is a **real npm project on disk, driven from outside** — exactly as `gh` and `claude` already are — and the app is a host and a project manager rather than a renderer. That buys the hard part for free: `remotion studio` is a localhost dev server, so **the timeline editor is Remotion's own, hosted in the `WebContentsView` engine [Phase 32](phases/phase-32-browser-engine-and-tabs.md) already built**. The contrast with [43](phases/phase-43-workflows-mvp.md) is the point — that phase hand-rolls an SVG canvas *because no upstream editor exists* for a workflow graph; one does for a video timeline. `@remotion/player` was considered and rejected on a real argument, not on size: it is renderer-legal, but it would make the user's video project a build input to this app. Nothing here touches `git-engine`.

- **[Phases 40–43 · Projects, the board, the council room, and workflows](phases/phase-40-github-projects.md)** (3% · 6/176 — Phase 40 Theme A landed 2026-09-02: `ForgeProject*` zod schemas, discriminated on `type`/`dataType`, in their own `domain/forge-project.ts`; channels + bridge envelope; 12 round-trip tests) — **Four planned phases, none started**, carved out of [`.midnite/_features.md`](../_features.md) items 1–4 and the first net-new *product* frontier since Phase 34. They stack: **[40](phases/phase-40-github-projects.md)** opens ProjectV2 — GraphQL-only, which is exactly why `gh-graphql.ts` exists — as a read-and-nudge Projects view; **[41](phases/phase-41-agentic-kanban.md)** turns that table on its side as a `[ Table | Board ]` mode in the same view, where a card can launch an agent and grows the `loop-glow` border while it runs, with a live xterm inside it; **[42](phases/phase-42-councils-layout.md)** is the smallest and the one two others want first — it builds the `panel-stack` history primitive the app lacks (councils' selection is one `useState`, which is why "back/forward" is not a CSS change) and moves councils to config-right / output-centre; **[43](phases/phase-43-workflows-mvp.md)** finally fills the `workflows` ViewId that has rendered `<Placeholder>` since Phase 19, with a hand-rolled SVG canvas and a real local `node:http` CRUD API to build against. 41 depends on 40; 42 and 43 are independent, and 42 unblocks 43 Theme F. Nothing here touches `git-engine`.

- **[Phase 39 · One rail, five chords and four loops](phases/phase-39-status-bar-shortcut-rail.md)** (95% · 61/64) — **All seven themes landed** ([PR #7](https://github.com/bilo-io/midnite-studio/pull/7), [PR #33](https://github.com/bilo-io/midnite-studio/pull/33), 2026-09-02); two human-only passes (a keyboard sweep, an eye-pass) remain at the phase's `## Verification` level. The status bar's left zone is now a **shortcut rail** whose job is teaching its own chords: **icon plus chord at rest, the name only while that surface is open or under the pointer**. Three toggles that were three verbatim copies of the same twenty lines — and had already drifted, two hard-coding `⌘`+letter in JSX so the same commands read `⌘G`/`⌘B` wherever `Mod` is `Ctrl` — collapsed behind one `StatusToggle`, and `displayChord` now owns the upper-casing. `⌘K` and `⌘P` **moved** out of the title bar (one control, one home) and diagnostics left the machine-vitals cluster, both landing behind separators `segments.ts` now *derives* from a new `group` field — which also fixed `browser-toggle`'s `priority: 5`, the inversion that had it render first and shed first. The separator rule is the phase's one real design find: placement is pure, but **pruning reads the rendered DOM**, because the `health` group renders *nothing* for a repo with no linter and an *Enable diagnostics* prompt for an untrusted one, and only that segment's own hooks know which — a `collapsible` group flag, the doc's own recommendation, would have made correctness depend on every future author remembering to declare it. After the agent count sit **four loop launchers**, `openFabTab` in one click, coloured from a new renderer-side `loop-glow.ts` because `DEFAULT_LOOPS.color` is a Tailwind `text-*` class no `box-shadow` can read; glow means *running* (amber when waiting), an outline means *this tab is open*, and the strip **collapses to one glyph at rest**. Its pulse ships **gated on window focus** rather than unmeasured — a permanently mounted animation is precisely what Phase 36 Theme E was written about. `moon run :typecheck :lint :test` green at 2 722 tests; the CI-blocking e2e set 220/0; the 6 remaining `fab-loops` failures baselined as **identical on `origin/main`**, which is what caught the one real regression (an `aria-label` colliding with the waiting notice under Playwright's substring name matching).

- **[Phase 38 · Paying off the e2e suite](phases/phase-38-e2e-suite-repair.md)** (88% · 53/60, [PR #127](https://github.com/bilo-io/midnite-studio/pull/127)) — Themes A-F, I fully landed; G partial. **A** (PR #12) fixed a Phase-36 lazy-chunk pty-delivery race shared by seven `fab-loops`/`terminal-links` failures. **B**'s ten `changes-panel` failures were not the doc's two guesses: the collapsed nav rail's hover-expand reflow moved the "Changes" link out from under Playwright's `.click()` before it landed, so nothing ever rendered — fixed at the spec level; a real `DiffCell` gutter-count regression from Phase 26 was fixed in product code alongside it. **C** confirmed two real product bugs — a focus trap stealing focus from `ConfirmDialog`'s Cancel button, and a `min-w-0` flex-shrink overflow on a folded repo's summary pill — plus a stale checkout-persistence assertion that was actually a deliberately-landed feature. **E** found the same accessible-name substring collision (`getByRole` matching "System" against "System Health", "Update" against "App Updates") in three separate control pairs. **F** found the nav-rail hover/click-reflow hazard a second time (independently, in `review-threads-shots`) plus one more real regression: "Load the full log" had been silently truncated to "Load full log" by an unrelated PR. **I** closes out on the strength of two fixes: a `navigator.platform` chord-mismatch pin (Linux Chromium genuinely reads `'Linux'`, resolving `Control+\`` to the wrong chord entirely — not the GPU/WebGL problem first suspected) that also cleared six other files, plus a viewport-walking rewrite of two font-metric-dependent density tests that a wide-viewport DOM measurement (the fix that worked elsewhere) couldn't reach. `H` stays blocked on `G`'s own two still-unsolved `graph-themes.spec.ts` cascade-replay specs — the only entries left in `KNOWN_RED`.
- **[Phase 37 · A glow that knows which tab](phases/phase-37-fab-tab-glow.md)** (93% · 41/44) — All six themes landed in one batch ([PR #8](https://github.com/bilo-io/midnite-studio/pull/8), 2026-09-02). The FAB panel's rotating rainbow border now grows an **inner glow**: a blurred conic layer masked to the rim so it falls off smoothly to nothing before the centre, breathing rather than static, and pulsing at a cadence tied to loop state. The glow is **tab-reactive** — each of the four loops claims the 180° of ramp centred on its own hue (Medic→rose, Watchdog→amber, Automate→emerald, Innovate→blue), and the far half is subtracted, with border and glow driven from one shared arc mask so they never disagree; the collapsed FAB button and each tab's own Start/Stop button pick up the same arc for free. Also tokenised the seven-stop rainbow that used to sit hard-coded in five places. Three items stay open for a human on real hardware: this sandbox had no Accessibility permission to script the panel open in a packaged build, and its own idle-CPU baseline swung 22%→55% of a core across two runs of unmodified `main` — too noisy to trust a delta, so the mitigation (a window focus/blur gate on the glow's rotation and pulse) shipped unconditionally rather than after a measurement.
- **[Phase 36 · Faster, lighter, same app](phases/phase-36-performance-diet.md)** (91% · 58/64 · refined x1) — Seven of eight themes landed (2026-09-01, local). The app's first dedicated performance phase, and it kept its own rule: every landed item carries a number. **Entry chunk 2 481.3 → 1 084.7 KB** (−56%) by putting thirteen views, xterm and the markdown pipeline behind lazy boundaries under one Suspense; **`ready-to-show` 683 → 570 ms** by taking the synchronous login-shell probe (a median 284 ms of blocked main thread) off the boot path and parallelising the three `whenReady` chains; **the broker went from 12.74% to 1.16% of a core per MB/s** — 11× less CPU per byte — once pty output was coalesced into one frame per 16 ms instead of one socket write *and* one whole-buffer scrollback realloc per chunk; and the `ps` probe's cadence doubled after being costed at 4.08% of a core. `moon run app:perf` is the phase's legacy: strict budgets plus absence assertions that fail the day someone re-adds a static import. Four of the doc's items were **acquitted rather than churned**, each with the measurement that acquits it — the three handler-module deferrals, the `@dnd-kit` split, `manualChunks`, and a `lucide-react` assertion a dependency makes unassertable. Three items stay open: one `useAutoFetch` test that belongs to Theme E, and two human passes (a screenshot diff, an Activity Monitor idle check).
- **[Phase 35 · FAB Mission Control](phases/phase-35-fab-mission-control.md)** (98% · 39/40) — All five themes landed (2026-09-01, local). Made the (previously untracked, ad-hoc) FAB panel a real loop console: each tab owns its own in-panel terminal session (`surface: 'fab'`, never in the main housing), a checkbox prompt composer per loop, Start↔Stop with the gradient glow pulse, and a mission-control layer — FAB badges, waiting-toasts, a capped run history. Also retires the FAB's hard-coded prompts by pointing each loop at the `DEFAULT_AGENT_SKILLS` entry it runs, so there is one prompt store rather than three. Themes F–I (PR #3) then closed three of the four open verification items and as much of the fourth as a browser reaches — and found, in the doing, that a persisted loop never came back unless you opened the *main* terminal panel first. One item stays open for a human: quit and relaunch mid-run against a **packaged** build.
- **[Phase 34 · Agent Councils](phases/phase-34-agent-councils.md)** (100% · 34/34) — Landed. Fills the nav/palette-reserved "Councils" slot: a standing panel of AI members answers a prompt in parallel, synthesized into one distilled write-up. MVP scope — one format (brainstorm), global (not per-repo), a 3-agent member pool (`agy`/`codex`/`opencode`), and an explicit auto-send exception to the app's usual type-but-don't-send agent-launch posture. Two manual passes (a real end-to-end run, a copy review) remain for a human.
- **Phases 25–33 all landed** — search/blame, split diffs, status bar + browser pane, worktrees-first sidebar, markdown slides, the detached terminal broker, interactive rebase, the real browser engine, and the installable app + CLI.
- **[24 · The explorer learns to write](phases/phase-24-writable-explorer.md)** (78% · 43/55) **and [23 · A command palette](phases/phase-23-command-palette.md)** (76% · 42/55) are both closed as DONE with their remainders logged in [`outstanding.md`](outstanding.md).
- **[22 · Stash, the reflog, and writes you can take back](phases/phase-22-stash-and-safety-net.md)** (100% · 56/56, [PR #51](https://github.com/bilo-io/midnite-studio/pull/51) + [PR #52](https://github.com/bilo-io/midnite-studio/pull/52)) — **Themes B, E, F and G landed** (2026-09-03, PR #51), closing the four surfaces the prior audit found stubbed: stash reaches the **sidebar** (a `Stashes` `TreeSection`, `hideWhenEmpty={false}` so its own "Stash changes" action stays reachable at zero count) and the **Changes view** (a toolbar action + per-row action, a dedicated `StashPushDialog` rather than the generic one-field prompt); **force-push** ships as `--force-with-lease` only, gated behind a new `Settings ▸ Git Safety` opt-in and offered only from the per-ref badge menu once a plain push has already been rejected as non-fast-forward; and the **reflog** is real — `readReflog` via `--date=unix` (the doc's own `%gt` placeholder doesn't exist in git, confirmed directly), replacing Theme H's honest `ReflogList` placeholder with a ref selector, action filter, and checkout-able/copy-able list. **Themes C and D landed** (2026-09-03, PR #52): stashes are pseudo-rows above the graph (`StashRows`, the same dashed grammar `UncommittedRow` set) and the inspector reads all three of a stash's parts — tracked, index and untracked — over one `TreeSection`-per-part list rather than tabs, with a new discriminated `graphSelection` in `ui-store.ts` routing both the graph and the sidebar into the same panel. Theme H stays `◐ PARTIAL` — its narrowed starter-subset scope is otherwise complete, so the phase counts 56/56 with H's own remainder left as-is rather than resolved here.



Completed work is logged append-only in [`done.md`](done.md). Deferred scope lives in [`outstanding.md`](outstanding.md).

## Phases

<!-- Newest-first. Status: ✅ DONE · 🔄 WIP · ◻ TODO. Done = checked/total in-scope items; Progress = 10-cell bar. -->

| Phase | Status | Refined | Done | Progress | % | 🔄 WIP | ◻ TODO |
|-------|--------|---------|------|----------|---|--------|--------|
| [69 · A tracker that can count](phases/phase-69-a-tracker-that-can-count.md) | 🔄 WIP | — | 30/31 | `██████████` | 97% | — | — |
| [68 · Where focus goes when the dialog closes](phases/phase-68-where-focus-goes.md) | ✅ DONE | — | 32/37 | `█████████░` | 86% | — | — |
| [67 · The sessions you closed](phases/phase-67-the-sessions-you-closed.md) | ◻ TODO | — | 0/42 | `░░░░░░░░░░` | 0% | — | A B C D |
| [66 · API Client](phases/phase-66-api-client.md) | ◻ TODO | — | 0/58 | `░░░░░░░░░░` | 0% | — | A B C D E F G H I J K |
| [65 · Somewhere for a crash to go](phases/phase-65-somewhere-for-a-crash-to-go.md) | 🔄 WIP | — | 35/49 | `███████░░░` | 71% | E | — |
| [64 · Offline Monaco Editor & Cross-Surface Theme Engine](phases/phase-64-offline-monaco-and-themes.md) | 🔄 WIP | x1 | 52/72 | `███████░░░` | 72% | — | G |
| [63 · The preferences with nowhere to live](phases/phase-63-settings-diff-and-orphan-preferences.md) | ✅ DONE | x1 | 32/32 | `██████████` | 100% | — | — |
| [62 · One Escape, one dismissal](phases/phase-62-one-escape-one-dismissal.md) | ✅ DONE | — | 29/33 | `█████████░` | 88% | — | — |
| [61 · Database Explorer](phases/phase-61-database-explorer.md) | 🔄 WIP | x1 | 41/94 | `████░░░░░░` | 44% | F I | C G H J |
| [60 · A window that never goes blank](phases/phase-60-view-registry-and-error-boundaries.md) | ✅ DONE | — | 28/34 | `████████░░` | 82% | — | — |
| [59 · Workspace Optimizer](phases/phase-59-workspace-optimizer.md) | ✅ DONE | x1 | 70/70 | `██████████` | 100% | — | — |
| [58 · Notes, and the menu that holds them](phases/phase-58-notes-and-the-menu.md) | 🔄 WIP | x1 | 0/78 | `░░░░░░░░░░` | 0% | A B C D | E F G |
| [57 · Midnite Studio speaks MCP](phases/phase-57-mcp-server.md) | 🔄 WIP | x1 | 44/76 | `██████░░░░` | 58% | E F | — |
| [56 · E2E Suite Speed Run](phases/phase-56-e2e-speed-run.md) | 🔄 WIP | — | 27/29 | `█████████░` | 93% | — | D |
| [55 · Multi-Window Studio & Detachable Panels](phases/phase-55-multi-window-studio.md) | 🔄 WIP | x1 | 31/47 | `███████░░░` | 66% | H I J |  |
| [54 · An Issues view](phases/phase-54-issues-view.md) | 🔄 WIP | — | 43/45 | `██████████` | 96% | — | Verification (2 human passes) |
| [53 · The first release](phases/phase-53-first-release.md) | 🔄 WIP | x1 | 3/59 | `█░░░░░░░░░` | 5% | — | B C D E F G H |
| [52 · Projects, the Board, and Workflows, navigable](phases/phase-52-projects-navigation.md) | 🔄 WIP | — | 40/43 | `█████████░` | 93% | — | Verification (3 human passes) |
| [51 · The terminal, made steady](phases/phase-51-terminal-steadiness.md) | 🔄 WIP | — | 31/37 | `████████░░` | 84% | — | human verification pass (6 items) |
| [50 · Kanban & Projects, Follow-Through](phases/phase-50-kanban-projects-followthrough.md) | 🔄 WIP | — | 15/17 | `█████████░` | 88% | — | F (codex human pass), Verification (2 human passes) |
| [49 · Onboarding a repo: Setup and Update](phases/phase-49-repo-onboarding.md) | 🔄 WIP | — | 31/33 | `█████████░` | 94% | — | Verification (2 human passes) |
| [48 · Apply suggested-change blocks](phases/phase-48-apply-suggested-changes.md) | 🔄 WIP | — | 19/20 | `██████████` | 95% | — | E (human round-trip verification) |
| [47 · Conflict Resolution Studio](phases/phase-47-conflict-resolution-studio.md) | 🔄 WIP | — | 22/23 | `██████████` | 96% | — | F (human diff3 pass) |
| [46 · The lock screen, and a motion policy that holds](phases/phase-46-lock-screen-and-motion.md) | 🔄 WIP | — | 37/49 | `████████░░` | 76% | — | Verification (human keyboard + eye pass) |
| [45 · The leak audit](phases/phase-45-leak-audit.md) | 🔄 WIP | — | 32/35 | `█████████░` | 91% | — | F (human long-running-session pass) |
| [44 · Video Studio](phases/phase-44-video-studio.md) | 🔄 WIP | — | 59/64 | `█████████░` | 92% | F H | F (skill-presence check), H (per-item palette entries), human pass (real repo + `ps` checks) |
| [43 · Workflows](phases/phase-43-workflows-mvp.md) | 🔄 WIP | x1 | 56/77 | `███████░░░` | 73% | — | I (human pass) |
| [42 · Councils, rearranged](phases/phase-42-councils-layout.md) | 🔄 WIP | x1 | 38/44 | `█████████░` | 86% | — | — |
| [41 · Agentic Kanban](phases/phase-41-agentic-kanban.md) | 🔄 WIP | x1 | 49/57 | `█████████░` | 86% | H | — |
| [40 · GitHub Projects](phases/phase-40-github-projects.md) | 🔄 WIP | x1 | 38/53 | `███████░░░` | 72% | — | G (human screenshots + real-board pass) |
| [39 · One rail, five chords and four loops](phases/phase-39-status-bar-shortcut-rail.md) | 🔄 WIP | — | 61/63 | `██████████` | 97% | — | Verification (human keyboard + eye pass) |
| [38 · Paying off the e2e suite](phases/phase-38-e2e-suite-repair.md) | 🔄 WIP | — | 53/60 | `█████████░` | 88% | G | H (blocked on G — Theme H's own precondition is `KNOWN_RED` empty) |
| [37 · A glow that knows which tab](phases/phase-37-fab-tab-glow.md) | 🔄 WIP | — | 41/44 | `█████████░` | 93% | — | F (human idle-cpu + resize check) |
| [36 · Faster, lighter, same app](phases/phase-36-performance-diet.md) | 🔄 WIP | x1 | 58/64 | `█████████░` | 91% | — | G (human passes) |
| [35 · FAB Mission Control](phases/phase-35-fab-mission-control.md) | 🔄 WIP | — | 39/40 | `██████████` | 98% | — | — |
| [34 · Agent Councils](phases/phase-34-agent-councils.md) | ✅ DONE | — | 34/34 | `██████████` | 100% | — | — |
| [33 · Application Installation, CLI Tool & Desktop Integration](phases/phase-33-installable-app-and-cli-integration.md) | 🔄 WIP | x1 | 15/59 | `███░░░░░░░` | 25% | — | — |
| [32 · The browser gets an engine, and the tabs to fill it](phases/phase-32-browser-engine-and-tabs.md) | 🔄 WIP | — | 45/99 | `█████░░░░░` | 45% | — | — |
| [31 · Interactive Rebase Builder & Graph Sequence Editor](phases/phase-31-interactive-rebase.md) | ✅ DONE | — | 22/22 | `██████████` | 100% | — | — |
| [30 · A terminal that survives you](phases/phase-30-terminal-hardening.md) | 🔄 WIP | x2 | 90/91 | `██████████` | 99% | — | — |
| [29 · Markdown slides, everywhere markdown already renders](phases/phase-29-markdown-slides-viewer.md) | 🔄 WIP | — | 21/29 | `███████░░░` | 72% | — | — |
| [28 · Worktrees first, and the section tree that can say so](phases/phase-28-sidebar-section-tree.md) | ✅ DONE | — | 61/61 | `██████████` | 100% | — | — |
| [27 · The footer becomes a status bar, and the browser it makes room for](phases/phase-27-status-bar-and-browser-panel.md) | ✅ DONE | x1 | 90/90 | `██████████` | 100% | — | — |
| [26 · Side by side, and the room to show it](phases/phase-26-side-by-side-diffs.md) | 🔄 WIP | — | 54/68 | `████████░░` | 79% | — | — |
| [25 · Search everywhere, and the blame that explains it](phases/phase-25-search-everywhere.md) | 🔄 WIP | x1 | 39/101 | `████░░░░░░` | 39% | — | — |
| [24 · The explorer learns to write, and to search](phases/phase-24-writable-explorer.md) | 🔄 WIP | — | 43/55 | `████████░░` | 78% | — | — |
| [23 · A command palette, and the registry that can feed it](phases/phase-23-command-palette.md) | 🔄 WIP | — | 42/55 | `████████░░` | 76% | — | — |
| [22 · Stash, the reflog, and writes you can take back](phases/phase-22-stash-and-safety-net.md) | 🔄 WIP | — | 56/70 | `████████░░` | 80% | — | — |
| [21 · Agent roster + terminal identity](phases/phase-21-agent-roster-and-terminal-identity.md) | ✅ DONE | — | 46/46 | `██████████` | 100% | — | — |
| [20 · Reviews page & unified diff syntax highlighting](phases/phase-20-reviews-page.md) | ✅ DONE | — | 45/45 | `██████████` | 100% | — | — |
| [19 · Dashboard, Actions and Tests as views](phases/phase-19-dashboard-actions-tests.md) | ✅ DONE | — | 76/76 | `██████████` | 100% | — | — |
| [18 · Footer system monitor + repo diagnostics](phases/phase-18-footer-monitor-diagnostics.md) | ✅ DONE | — | 54/54 | `██████████` | 100% | — | — |
| [17 · Repositories workbench + forge](phases/phase-17-repos-workbench.md) | ✅ DONE | — | 41/41 | `██████████` | 100% | — | — |
| [16 · Folder explorer, preview pane + settings pages](phases/phase-16-explorer-and-settings-pages.md) | ✅ DONE | — | 42/42 | `██████████` | 100% | — | — |
| [15 · Multi-terminal sessions + agents](phases/phase-15-multi-terminal-sessions.md) | ✅ DONE | — | 39/39 | `██████████` | 100% | — | — |
| [14 · Graph themes + avatars](phases/phase-14-graph-themes.md) | ✅ DONE | — | 28/28 | `██████████` | 100% | — | — |
| [13 · UI polish](phases/phase-13-ui-polish.md) | ✅ DONE | — | 28/28 | `██████████` | 100% | — | — |
| [12 · Commit inspector + live badges](phases/phase-12-commit-inspector.md) | ✅ DONE | — | 12/12 | `██████████` | 100% | — | — |
| [11 · Packaging + docs](phases/phase-11-packaging.md) | ✅ DONE | — | 12/12 | `██████████` | 100% | — | — |
| [10 · Watcher / live refresh](phases/phase-10-watcher.md) | ✅ DONE | — | 9/9 | `██████████` | 100% | — | — |
| [9 · Integrated terminal + keybindings](phases/phase-9-terminal-and-keybindings.md) | ✅ DONE | — | 11/11 | `██████████` | 100% | — | — |
| [8 · Drag-drop ops + conflicts](phases/phase-8-drag-drop-ops.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [7 · Graph interactions](phases/phase-7-graph-interactions.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [6 · Status / stage / commit / sync](phases/phase-6-status-and-sync.md) | ✅ DONE | — | 11/11 | `██████████` | 100% | — | — |
| [5 · Commit graph, read-only](phases/phase-5-commit-graph.md) | ✅ DONE | — | 11/11 | `██████████` | 100% | — | — |
| [4 · Repo open/list + worktree sidebar](phases/phase-4-repos-and-worktrees.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [3 · Electron shell boots](phases/phase-3-electron-shell.md) | ✅ DONE | — | 15/15 | `██████████` | 100% | — | — |
| [2 · Lane layout engine](phases/phase-2-lane-layout.md) | ✅ DONE | — | 10/10 | `██████████` | 100% | — | — |
| [1 · Shared contracts + git-engine parsers](phases/phase-1-contracts-and-parsers.md) | ✅ DONE | — | 14/14 | `██████████` | 100% | — | — |
| [0 · Scaffold](phases/phase-0-scaffold.md) | ✅ DONE | — | 17/17 | `██████████` | 100% | — | — |

## Theme key

<!-- Each phase currently carries a single theme A = its full deliverables checklist. Split into
     lettered themes if a phase gets parallelised. -->

### [Phase 69 — A tracker that can count](phases/phase-69-a-tracker-that-can-count.md)

*15 of 69 docs disagree with the index about their own item counts; three phases marked 100% hold 162 open boxes; one declares two themes twice with contradictory stamps. The guard all three skills run checks only that a row exists, never that it is right.*

- ✅ **A** — The check: `scripts/tracker-check.mjs`, seven rules (row exists, doc exists, counts agree, no duplicate theme letters, theme letters agree, `Refined: xN` matches, bar and `%` match), import-free like Phase 53's `version-check.mjs`, with `--fix` for the arithmetic rules **only** — a duplicate theme is a human decision, not an arithmetic one. ([PR #168](https://github.com/bilo-io/midnite-studio/pull/168))
- ✅ **B** — The three structural bugs it fails on day one: Phase 32's duplicate H and I with contradictory stamps (`✅ DONE` at :279 vs `✅ PARTIAL` at :312), Phase 33's `✅ PARTIAL` where `◐` belongs, and phases 25 and 35's theme-letter drift. ([PR #168](https://github.com/bilo-io/midnite-studio/pull/168))
- ✅ **C** — Making the fifteen honest without pretending: `--fix` the arithmetic so three phases' `%` **drops** from 100% and nine `✅ DONE` rows become `🔄 WIP`, re-describe the parked entries in `outstanding.md` now that the doc is the accurate record, and replace the shell one-liner in six skill files with the task. **Ticks nothing** — the tracker becomes honest about being incomplete, not more complete. ([PR #168](https://github.com/bilo-io/midnite-studio/pull/168))

### [Phase 68 — Where focus goes when the dialog closes](phases/phase-68-where-focus-goes.md)

*Eleven overlays trap focus, three restore it three different ways, eight drop it on `<body>`. The fix goes inside `useFocusTrap` rather than beside it, because the newest modal copied `ConfirmDialog` — which does not restore — and two more are the same skeleton byte for byte.*

- ✅ **A** — The trap gives focus back: capture on activation not first render, restore only to a live element (`isConnected` appears **nowhere** in the renderer today), never to `<body>`, never over a focus that moved deliberately, always with `preventScroll` — plus `:not([inert])` on `FOCUSABLE`, since `Collapse` marks its collapsed region inert and a dialog containing one currently Tab-cycles through invisible buttons. Signature unchanged.
- ✅ **B** — The eight that never gave it back: fixed with **no edit to any of them** — that is the acceptance criterion. Deletes `palette.tsx`'s three-bug implementation and `browser-pane.tsx`'s `data-testid` `querySelector`, keeps `popover.tsx`'s better `triggerRef` version with a comment saying why.
- ✅ **C** — The context menu means what it says: `role="menu"`/`role="menuitem"` with **zero** focus/tabIndex/autoFocus today, portalled to the end of `<body>` so its first item is a whole document away, and submenus that open on hover only. Roving focus, arrows, Home/End, ArrowRight/Left for submenus.
- ✅ **D** — The two modals that were never modals: `onboarding-modal.tsx` (shown to first-time users) and `rebase-modal.tsx` (over a destructive op) have no role, no `aria-modal`, no trap; plus the missing trap on `help-overlay.tsx`, whose Tab currently walks out into the deck behind it.

### [Phase 67 — The sessions you closed](phases/phase-67-the-sessions-you-closed.md)

*The Sessions rail row has rendered a `Placeholder` since Phase 23 — the only `ViewId` of seventeen with no arm — and the app already wrote down what it should be (`LuHistory`, 'Agent Sessions', 'agent session history transcripts'). There is no history to show, because closing a session deletes its row and its transcript. Record the ending, then render it.*

- ◻ **A** — A session that ends leaves a record: a `ClosedSession` schema (not an `.extend()` of a `ZodEffects`), a `session-history-store.ts` in `trust-store.ts`'s shape, `forgetTerminal` archiving instead of deleting with the transcript **renamed not copied**, a 200-cap that evicts the file alongside the row, and a real `purge` channel since 'forget' no longer forgets.
- ◻ **B** — The history channel: three free `mstudio:sessions:*` channels, `Uint8Array` transcripts structured-cloned never base64, and the `register`/`configure` split handlers need because they register before `userData` exists.
- ◻ **C** — The view: list + transcript on `issues-view.tsx`'s layout (flat, not Councils' hierarchy), rows labelled by the session's own name rather than `session.title` (the repo name), `exited` given a dot tone distinct from `idle`, a `reason` facet, a real skeleton since history is fetched, and unpersisted selection in `issues-store.ts`'s shape.
- ◻ **D** — The rail row stops lying: the `sessions` arm placed **above** the `!selectedRepoId` guard since history spans repos, the stale `todo/` string gone, the palette's repo-name-for-every-row label fixed, and the FAB gap decided — those sessions appear in no list but the palette, which navigates to a blank pane.

### [Phase 66 — API Client](phases/phase-66-api-client.md)

*A Postman-compatible API client — import/export real collection and environment files, a full request builder, environments with variable interpolation, a sandboxed test-script runner, and a sequential collection runner — joining the Workspace sidebar group.*

- ◻ **A** — Shared contracts: Postman v2.1 format, passthrough-preserving zod schemas, IPC channels.
- ◻ **B** — Workspace nav + view registration: `apiClient` ViewId, rail entry, icon, command.
- ◻ **C** — Sidebar tree + multi-request tabs.
- ◻ **D** — Request builder: params/headers/auth/body across seven content-type modes.
- ◻ **E** — Main-process HTTP send engine (new IPC, reusing the workflow `http.ts` cap/timeout pattern).
- ◻ **F** — Response viewer: per-content-type rendering, per-request history.
- ◻ **G** — Environments + `{{var}}` interpolation, gitignored secret overlay.
- ◻ **H** — Test editor & sandboxed script runner (pinned `pm.*` subset via Node `vm`).
- ◻ **I** — Collection runner: sequential run, aggregate pass/fail.
- ◻ **J** — Import/export & git-friendliness under `.midnite/api/`.
- ◻ **K** — Verification.

### [Phase 65 — Somewhere for a crash to go](phases/phase-65-somewhere-for-a-crash-to-go.md)

*The sink and the channel Phase 60 Decision 3 deferred: structured levels on main's one 14-line log seam, a rotating file under `userData`, a renderer→main error-report path, main's own uncaught crashes, and two buttons plus a bug link so a user can actually hand any of it over.*

- ✅ **A** — Levels on the one seam, and a file under it: `Logger` becomes a callable type with `info`/`warn`/`error` so all ~40 existing call sites compile unchanged; a directory-injected, size-capped, rotating NDJSON `log-sink.ts` that never throws into its caller; the stale `log.ts:6-9` header corrected; `fingerprintFile` lifted out of `broker-client.ts`.
- ✅ **B** — The channel, and the helper it deserves: four `mstudio:report:*` channels (`diag` is taken), a capped `ErrorReportSchema`, `redactPaths` in `shared`, a reveal channel that takes no path, and `handleSend` — the `ipcMain.on` counterpart the 40 hand-rolled `safeParse` sites never had.
- ✅ **C** — The renderer learns to report: `lib/report.ts` in `lib/perf.ts`'s shape, dedupe + a session cap so a render loop cannot storm IPC, `error`/`unhandledrejection` listeners in `main.tsx` covering both roles, and the one exported function Phase 60's `componentDidCatch` will call.
- ✅ **D** — Main's own crashes reach the same sink: `uncaughtException`, `unhandledRejection`, `child-process-gone`, `unresponsive` on app windows (bound only for browser tabs today), the three existing `render-process-gone` binds moved to `log.error`, and a boot line identifying the build.
- ◻ **E** — A user can get at it in two clicks: Reveal log + Copy diagnostics inside the Diagnostics accordion that already exists (not an 18th settings page), and the first "Report a bug" link in the app, pointed at `bilo-io/midnite-apps`.

### [Phase 64 — Offline Monaco Editor & Cross-Surface Theme Engine](phases/phase-64-offline-monaco-and-themes.md)

*Refined x1: four of the phase's premises were wrong — `themeMode` does not exist (light/dark is `@bilo-io/ui`'s provider, four modes, localStorage `midnite.theme`), there is no CSP at all (the real constraint is the `file://` opaque origin), Theme D was backwards (the dispatcher's capture-phase `stopPropagation` means the app steals Monaco's chords, not the reverse), and an Appearance page already exists whose first accordion is titled "Theme". Plus a fifth themed surface the plan missed (Shiki, hard-wired to two GitHub themes by a literal return type) and a direct conflict with Phase 61, which rejects Monaco in writing.*

- ✅ **A** — Vite offline Monaco & worker pipeline: `getMonaco()` lazy singleton in `highlighter.ts`'s shape, workers built `?worker&inline` because a `file://` origin blocks `new Worker(new URL(...))` (Shiki's inlined WASM is the precedent), a `MonacoEnvironment.getWorker` default arm, and `monaco-editor` added to the `MUST_BE_ABSENT` entry-chunk tripwire — 184 KB of budget headroom against a ~2 MB dependency. Also found: `monaco-editor/esm/vs/...` import paths double up against the package's own `exports` map and only fail at a production build. ([PR #164](https://github.com/bilo-io/midnite-studio/pull/164))
- ✅ **B** — Unified cross-surface palette registry: `StudioPalette` over the 22 real `@bilo-io/ui` tokens as HSL triplets (Tailwind wraps them in `hsl()`), six presets, a store persisted in `appearance-store` (which gains the `partialize` and `migrate` it has never had), and **five** surfaces synced — chrome, xterm (16 ANSI keys, net-new), Monaco, Shiki and popouts — reusing the in-place re-theme path that already exists rather than adding a broadcast. No settings UI — Theme F's job, left open. ([PR #164](https://github.com/bilo-io/midnite-studio/pull/164))
- ✅ **C** — Writable Monaco editor in Files view: same `{fileName}` signature and `data-testid`, wired to the store's ten real actions with dirty left derived, a Shiki-id → Monaco-id translation table, the five editor preferences that do not exist yet (four sites + a `version` 8 → 9 bump), focus restoration on unmount, and the latent missing `key={editorKey}` fixed. ([PR #164](https://github.com/bilo-io/midnite-studio/pull/164))
- ✅ **D** — Chord yielding, both directions: `insideTerminal`'s hard-coded `.xterm` becomes a `YIELD_ROOTS` registry with per-root command sets, and the three native accelerators that bypass it entirely — `Cmd+G` (find-next), `Cmd+L`, `Cmd+O` — move to `itemNoAccelerator()`. Escape/Monaco-widget dismissal left open (Decision 3 — Phase 62 is 0%). ([PR #164](https://github.com/bilo-io/midnite-studio/pull/164))
- ✅ **E** — VS Code theme JSON importer: a zod-validated result envelope, array-form (and comma-separated) `scope` flattening (the usual reason a naive importer renders grey), hex → HSL triplet conversion (8-digit alpha dropped), ANSI fallbacks to the matching GitHub built-in, and three committed fixtures plus malformed/oversized/empty rejection cases. `zod` is now a direct `packages/app` dependency (pnpm's isolated `node_modules` refused the phantom access "already a dependency via shared" implied). ([PR #171](https://github.com/bilo-io/midnite-studio/pull/171))
- ✅ **F** — Palette accordion in the **existing** Appearance page (not an 18th settings page), plus the light/dark control that page has never had, preset cards with swatches, independent terminal/editor overrides, and two palette commands (`theme.select`/`theme.import`) registered in all four places a command needs — including the `PALETTE_SAFE` allowlist that fails silently. `theme.import` opens the accordion's own file picker via a register/unregister handle store when the page is mounted, the same shape `workflow.run` uses. ([PR #171](https://github.com/bilo-io/midnite-studio/pull/171))
- ◻ **G** — Decommissioning CodeMirror (**new in x1**): retarget the six `.cm-content`/`.cm-gutters` assertions in `files-editor.spec.ts` that would go red on Theme C's first commit, drop the seven `@codemirror/*` deps — gated on Phase 61, which builds its SQL editor on the very file this phase replaces.

### [Phase 63 — The preferences with nowhere to live](phases/phase-63-settings-diff-and-orphan-preferences.md) — ✅ DONE

*`useUiStore` persists (as of this PR) 72 keys and every preference cluster among them has a settings page that owns it — except four. `diffLayout`, `diffShowOldGutter`, `commitFileView` and `changesFileView` were reachable only from controls that are conditionally rendered, so the diff-layout toggle did not exist at all while a binary file was open. One page, and one test that stops a fifth from being orphaned.*

- ✅ **A** — [PR #167](https://github.com/bilo-io/midnite-studio/pull/167) — The page: `settings-pages/diff-page.tsx` in `sidebar-page.tsx`'s shape, two accordions ("Diff view", "File lists"), four `Choice` blocks whose hints name the constraints the toolbar hides, and a per-accordion reset to the literal store defaults.
- ✅ **B** — [PR #167](https://github.com/bilo-io/midnite-studio/pull/167) — Registration, and the one the compiler will not catch: `SettingsPageId`, `SETTINGS_PAGES`, `settings-view.tsx`'s `PAGE_CONTENT` (not `PAGES`), plus the exhaustive `SETTINGS_PAGE_ICON` record — and verifying that the palette and title-bar nav need no edit because both derive from `SETTINGS_PAGES`.
- ✅ **C** — [PR #167](https://github.com/bilo-io/midnite-studio/pull/167) — No orphan preference: `store/persisted-keys.ts` partitioning all persisted keys into preference vs session state, each exclusion annotated, typed so a key in neither list fails typecheck, and a test asserting every non-orphan preference key is named somewhere under `features/settings/`.

### [Phase 62 — One Escape, one dismissal](phases/phase-62-one-escape-one-dismissal.md)

*Twenty-four hand-rolled Escape handlers, no two alike, and no notion anywhere in the renderer of which overlay is on top — so one Escape really does dismiss two things, by three reachable paths. Builds that notion once as a module-level LIFO stack behind a single `window` listener, and moves the eighteen window-scoped handlers onto it. Also closes the occluder gap that paints four blocking overlays underneath a live `WebContentsView`.*

- ✅ **A** — The stack, and the hook that joins it: `components/use-dismiss.ts` in `use-focus-trap.ts`'s shape but ref-free, one `window` listener for the whole app, and a delivery rule — topmost blocking entry, else topmost passive — with `blocking` driving occluder registration too.
- ✅ **B** — The overlays move onto it: eighteen window/document handlers across seventeen files, layered `menu`/`popover`/`dialog`/`toast`/`tooltip`/`inline`; `confirm-dialog`, `prompt-dialog` and `palette` gain the occluder pair they never had; `popover` drops a `stopPropagation` that was inert all along.
- ✅ **C** — The element-scoped handlers stop leaking: `board-view` and `workflow-canvas` gain the one-line `stopPropagation()` that is the second double-dismiss path, the four input-scoped handlers are audited and deliberately left alone, and `e2e/overlay-stacking.spec.ts` finally asserts the theme it is named after.

### [Phase 61 — Database Explorer](phases/phase-61-database-explorer.md)

*Refined x1: six wrong premises and one architectural conflict. `better-sqlite3` would make this the repo's first **dual-ABI** native consumer — `rebuild-native.mjs` says in as many words that node-pty being main-process-only is "what makes this a one-line story rather than midnite's dual-ABI staging". `runQuery` was specified as a plain `invoke` when a full streaming precedent already exists (`stream-registry.ts`, `BATCH_SIZE = 500`, a `truncated` flag). The workbench-store change is architectural, not "entirely scoping". `TabStrip` has neither the new-tab button nor the dirty-dot convention the plan said it would reuse. `Mod+Enter` is `status.commit`. And `tree-section.tsx` keeps collapsed children **mounted**, a trap already documented in this repo.*

- ◻ **A** — Shared contracts: positional `rows` (SQL allows duplicate column names), `sqlitePath` with optional host/port, bigint/Date/Buffer normalisation, and channels split across **both** `CHANNELS` and `EVENT_CHANNELS` for the streaming pair.
- ◻ **B** — `db-engine` package from git-engine's literal template (no `type` field, hand-written tsconfig references since `syncProjectReferences: false`), four cursor-based drivers, a pooled connect guarded against the double-bind race `demo-api/server.ts` already documents, a CTE-aware statement sniffer, and **three** eslint edits not one.
- ◻ **C** — SQLite (**M, was S**): six packaging edits — `dependencies` not dev, esbuild `external`, `rebuild-native --only` list, `asarUnpack`, an unpacked-path `require` fallback, and the `verify-dist` native assertion that does not exist today. Gated on Decision 6, which recommends `node:sqlite` instead.
- ◻ **D** — IPC + vault: `register`/`configure` split (handlers register *before* `userData` exists), trust-store's shape with real zod, first `safeStorage` use — but the app already has a plaintext key in localStorage that names `safeStorage` as what it skipped — plus `'query'` in `StreamKind` **and** `POLICY`, and a batch producer mirroring `log-service.ts`.
- ◻ **E** — Nav + shell (**M, was S**): adding a `ViewId` is **17 sites**, seven compiler-enforced and ten silent — including `VIEW_IDS`, which routing derives from. The render arm must sit **above** the `!selectedRepoId` guard, because a database connection is not repo-scoped.
- ◻ **F** — Schema tree: `TreeSection` supplies chrome only and fights lazy loading (`<Collapse>` keeps children mounted), so the consumer ANDs both fold states into `enabled`; `depth` is capped at 4 levels, which is exactly what a schema tree needs.
- ◻ **G** — Query tabs (**L, was M**): a `'query'` arm carrying no `repoId` — which breaks `closeRepoTabs` and Phase 28's pruning — plus the `+` button `TabStrip` has never had, and a `●` in its `stats` slot. Decision 7 recommends **not** scoping the store.
- ◻ **H** — Results grid: rows stream in by subscription with stale-batch discard, `truncated` rendered visibly, parameterised PK-keyed `UPDATE`s in one transaction with their staleness re-read, editing refused on joins and PK-less tables, and CSV via the `Blob` + `<a download>` precedent that settled policy against a new IPC channel.
- ◻ **I** — Destructive gate: **not** `blastRadius`, whose type is git-shaped (`{sha, subject}[]`) — the row estimate goes in `warnings`, and `WITH … DELETE` is the sniffer's must-not-fail case.
- ◻ **J** — Suites + CI: four Playwright specs, shots through Phase 56 Theme G's shared helper, and three providers as service containers with MSSQL manual (Decision 5, now settled).

### [Phase 60 — A window that never goes blank](phases/phase-60-view-registry-and-error-boundaries.md)

*Sixteen views, eighteen `lazy()` calls and zero error boundaries — one render throw blanks the window. Collapses `app.tsx`'s 17-branch view ternary into an exhaustive `VIEW_COMPONENT` record, hangs a resettable boundary off it, and applies the existing `EmptyState`/`Skeleton` primitives to the six views that render none of the three states.*

- ✅ **A** — One record, not a ternary: `components/view-registry.tsx`'s `Record<ViewId, ViewEntry>` with a `global` flag replacing the load-bearing branch order, so a new `ViewId` fails typecheck instead of falling through to `Placeholder` (which is also how the stale `todo/` copy gets fixed).
- ✅ **B** — A boundary per view: `components/error-boundary.tsx`, reset on `activeView`, an `EmptyState` fallback with Try-again and Copy-details, mounted outside the view `Suspense`, on the three optional modals (silent `null`) and on the detached root.
- ✅ **C** — The three states, applied: the error → empty → skeleton → content ordering written down, then applied to `dashboard`, `tests`, `history`, `video`, `files` and `changes`, which carry none of the three today.

### [Phase 59 — Workspace Optimizer](phases/phase-59-workspace-optimizer.md)

*A CleanMyMac X / macOS Settings-style optimizer scoped to what this app owns — repos, worktrees, and its own terminal/agent processes — not a general Mac cleaner. Gated behind a default-off setting given the blast radius of cross-repo deletion and system-wide kill. The x1 refinement found three modules it proposed building that already exist, and one security primitive it never listed.*

- ✅ **A** (PR #163) — Foundation & feature gate (M, was S): `ViewId` + `VIEW_IDS` + the exhaustive `VIEW_ICON`, schemas under `shared/src/domain/optimizer.ts` (not top-level) with every field named and a 2,000-item cap on `ScanResult`, an `optimizer-handlers.ts` like the other 37, an unpersisted store — and the gate as the **seven** edits it really is, with no `version` bump. Phase 60 had not landed, so `optimizer` shipped as an 18th ternary branch in `app.tsx` per the doc's own contingency rather than a registry entry.
- ✅ **B** (PR #163) — Aesthetic components (M, was S): a byte-domain segmented bar and a circular gauge — **new components, not extensions**, because `MetricChart`'s domain is fixed at 0–100 by contract and every `metric-palette.ts` export is keyed on a closed `MetricId` union. A second `category-palette.ts` rather than widening the metrics contract to colour a bar.
- ✅ **C** (PR #163) — Workspace Cleaner (L): **`confineTree` in `fs-scope-write.ts` as a listed deliverable** — the existing jail confines one final segment and never descends, while this deletes trees across repos plus a picked root — a symlink-refusing bounded walk instead of `du`, **`shell.trashItem` rather than `fs.rm`**, delete-time re-validation against the scan's TOCTOU window, and stale-worktree defined for the detached-HEAD case the data model allows.
- ✅ **D** (PR #169) — Memory & process monitor (M): **extends `agent-process.ts`**, which already runs system-wide `ps` with a parser and fixtures, rather than writing a second one; a kill service with an argv-match PID-reuse guard, TERM-before-KILL, and a self-preservation deny-list — because the OS permission boundary does nothing about the user's own editor, browser, or this app.
- ✅ **E** (PR #163) — GPU tab (S, was M): `getGPUInfo` for model/VRAM **combined with** the existing `metrics/gpu.ts` probe for load, since neither reports both; the headless/CI fallback is already implemented there; `MetricChart` with a custom geometry for the 60s chart, not the hardcoded `aria-hidden` `Sparkline`; the two Tweak toggles ship visibly disabled.
- ✅ **F** (PR #169) — Verification (M): fifteen checklist items — all fifteen covered across PR #163 and PR #169, including Playwright e2e coverage for the Memory tab and process termination, light and dark screenshots, and unit test suites.

### [Phase 58 — Notes, and the menu that holds them](phases/phase-58-notes-and-the-menu.md)

*Per-repository notes in a gradient-ringed modal on `localStorage`, each one able to hand itself to the `brainstorm` / `execAdhoc` skills in a terminal cwd'd to its own repo. Plus the modal primitive twelve hand-rolled `z-dialog` overlays have been re-deriving — eleven of which are painted under a live `WebContentsView` today — and one quick-access menu behind both the FAB and the blank assistant-menu popover.*

- 🔄 **A** — The notes store (S): `midnite-studio.notes` on zustand `persist` in `dashboard-store`'s exact shape, `Record<noteId, Note>` with a pure `notesForRepo` selector, `status` and `done` as two independent axes — and **notes are not GC'd on repo close**, reversing the first draft to match the precedent it claimed to copy.
- 🔄 **B** — The modal primitive (M): `Modal` with enumerated `size`/`variant`/`align`, occluder registration, focus *restoration* (which none of the twelve get right), and a `.gradient-frame` variant — proved by migrating `prompt-dialog` and `browser-launcher`, while the other ten get the two-line occluder fix immediately and a regression test that counts all twelve.
- 🔄 **C** — The Notes surface (M): a 900px/80vh panel, in-place editing on Midnite's exact key contract (Enter commits · Shift+Enter newlines · Escape cancels *without closing the modal* · empty cancels), hide-completed, per-value status badges, two distinct empty states.
- 🔄 **D** — Status and handoff (M): **an extraction, not a second implementation** — `use-skill-handoff.ts` lifted out of `midnite-menu.tsx`, reading the user-configurable `agentSkills` rather than hard-coding two literals, and passing the prompt as a plain string because `startAgent` shell-quotes it.
- ◻ **E** — The quick-access menu (M): one component, two entry points, rows reusing `context-menu.tsx`'s existing `MenuItem` shape plus a mnemonic — `L` Loops · `N` Notes · `I` Report Issue · `G` Guided tour — with the bare-letter gate mirroring the palette's in `use-keybindings.ts`.
- ◻ **F** — Commands, keybindings and the doc sync (S): `fab.toggle` re-pointed and re-labelled, a chord-free `notes.toggle`, both open flags kept **out** of `PersistedUi` so there is no version bump — and `menu.ts:120`'s native `CmdOrCtrl+L` accelerator **fixed**, not merely confirmed absent.
- ◻ **G** — Verification (M): both entry points, the mnemonic paths, the full note lifecycle, a pty assertion that the handoff is typed and not sent, the occluder contract against a live browser pane, and an explicit test that closing a repo does *not* delete its notes.

### [Phase 57 — Midnite Studio speaks MCP](phases/phase-57-mcp-server.md)

*The app becomes an MCP server, so agents launched in its own terminal stop re-deriving repository state with `git` and `gh` and start asking for the parsed, laid-out answers main already holds. Read-only, off by default, over a build-fingerprinted Unix socket with a stdio shim — the broker's transport trick with a different payload.*

- ◻ **A** — The tool contract in `shared` (M): an `MCP_TOOLS` registry in the single-source-of-truth shape of `COMMANDS`, carrying `output` as well as `input` — inputs are new path-keyed schemas (`McpRepoTarget`), outputs are reused verbatim from `ipc/schemas.ts`; descriptions capped at 220 chars and required to name the command they replace, so the rule is assertable.
- ◻ **B** — The server in main (M): `startMcpServer()` on a `userData` Unix socket named by build fingerprint (honouring the 104-byte `sun_path` ceiling), the broker's `createFrameDecoder` at a 256 kB cap, a `MCP_HANDLERS` mapped type so a tool without a handler fails typecheck, 8 connections max, and a synchronous `before-quit` unlink.
- ◻ **C** — The stdio shim (S): a bundled node script — SDK bundled in, run under plain `node`, not `ELECTRON_RUN_AS_NODE` — that dials the socket **per call** so an app relaunch restores service without restarting the agent, and keeps stdout to protocol frames only.
- ◻ **D** — The read-only tool set v1 (M): `repo.list`, `repo.resolve`, `status.get`, `graph.log` (50 rows default, 200 max, with lanes), `diff.file`, `branch.list`, `forge.pulls`, `forge.checks` — each item naming the real `git-engine`/`gh-cli.ts` function it calls, with a spy asserting no handler ever enters `writeQueue.run`.
- ◻ **E** — Consent, scope and audit (M, was S): the enable flag as main-side state in `mcp-store.ts` (`repo-store.ts`'s shape) plus `mcp.get`/`mcp.set` channels; `repoPath` gated by `resolveRepoRoot` + `listRepos` with `realpath` on both sides, not `fs-scope.ts`; a bounded 50-entry audit ring with no payload bodies.
- ◻ **F** — The Settings page and status readout (S): the switch reading main, not `useUiStore`; **three** registration points asserted (`SettingsPageId`, `SETTINGS_PAGES`, `settings-view.tsx`'s `PAGES`); the copyable `claude mcp add` line; the tool list from the registry; the last 50 calls, pulled not pushed.

### [Phase 56 — E2E Suite Speed Run](phases/phase-56-e2e-speed-run.md)

*Cutting the Playwright suite runtime from 7–10 minutes down to 2–4 minutes through 8 CI shards, fine-grained inter-test parallelism, worker concurrency optimization, retry trims, Vite build caching, and screenshot cleanup.*

- ✅ **A** (PR #148) — Shard scale-up: 4 → 8 shards on `ubuntu-24.04`, with `timeout-minutes` recalibrated to 10. Measured: 3m24s–5m17s/shard.
- ✅ **B** (PR #148) — Inter-test parallelism: `fullyParallel: true` in `playwright.config.ts`, inherited by the CI ratchet config.
- ✅ **C** (PR #152) — Worker concurrency trial: measured `workers: 2` vs `workers: 1` across 3 full CI runs (24 shard-attempts, zero flake) — no wall-clock win (≈4m28s vs ≈4m22s average), so no override adopted; numbers left in both configs' own comments.
- ◻ **D** (attempted in PR #148, reverted) — Retry trim: 2 → 1 in CI to avoid 3-minute burns per failure now that `KNOWN_RED` is down to 1 file. Passed one CI run, then failed a previously-reliable spec twice on a second — CI-only variance the retry budget exists to absorb. Reverted to 2 pending a real fix.
- ✅ **E** (PR #148) — Vite dev server build cache in CI: cache `packages/app/node_modules/.vite` keyed by source and config hash.
- ✅ **F** (PR #152) — Screenshot gating in functional specs: gate raw `page.screenshot()` calls in functional specs behind `MSTUDIO_SHOTS`. Verified zero screenshot writes on a normal run; all 14 target PNGs regenerate under `MSTUDIO_SHOTS=1`.
- ✅ **G** ([PR #158]) — Shots suite shared fixture helper: extract `packages/app/e2e/shots-helper.ts` and refactor the 25 `*-shots.spec.ts` files.

### [Phase 55 — Multi-Window Studio & Detachable Panels](phases/phase-55-multi-window-studio.md)

*Auxiliary surfaces (Terminal, Git Repos, FAB Loops, Embedded Browser) detached into dedicated popout windows with universal top-left dock/undock hover-morph affordances and cross-window state sync. Refined against the tree: the window domain is **not** empty — `windowStateChanged` is already taken by `<TitleBar>` — `ptyData` reaches exactly one window today, and the e2e suite never launches Electron. Each of those bends a theme.*

- ✅ **A** ([PR #139](https://github.com/bilo-io/midnite-studio/pull/139)) — Window lifecycle & multi-window IPC: `domain/window.ts`, a `window-manager.ts` registry, the new `windowsChanged` event (the obvious name is taken), role-via-`additionalArguments`, a `windows.json` bounds store, and close/quit semantics.
- ✅ **B** ([PR #139](https://github.com/bilo-io/midnite-studio/pull/139)) — Universal top-left dock/undock affordances: hover morphs copying `terminal-session-list.tsx`'s fixed-size box, a `<TitleBar>`-reusing popout frame, `Mod+Shift+d` plus four chord-free palette rows, and one uniform re-dock strip for all four panels. The FAB detach button rides in the existing tab-bar row, not a new header — a dedicated header cost 28px the panel didn't have to spare, caught by CI.
- ✅ **C** ([PR #139](https://github.com/bilo-io/midnite-studio/pull/139)) — Detachable Terminal & FAB Loops popouts — gated on the per-`ptyId` subscriber registry that replaces `pty-service.ts`'s single-window `getWindowThunk`, without which a popout terminal receives nothing. The registry always unions in the main window regardless of explicit subscription, since `use-session-exits.ts` and `CouncilLiveOutput` rely on the pre-existing broadcast-to-main guarantee and never subscribe themselves.
- ✅ **D** ([PR #139](https://github.com/bilo-io/midnite-studio/pull/139)) — Detachable Embedded Browser: `WebContentsView` reparenting via the `win` that `Tracked` already carries, all tabs moving as a set, and `activateBrowserTab` narrowed to one window.
- ✅ **E** ([PR #143](https://github.com/bilo-io/midnite-studio/pull/143)) — Cross-window sync: a main-process relay as the authority (packaged renderers are `file://`, where `BroadcastChannel` may never fire) with an explicit field allowlist, `invalidateForWatchKind` reused for cache invalidation, and theme flips relayed.
- ◐ **F** ([PR #143](https://github.com/bilo-io/midnite-studio/pull/143)) — Verification: bare vitest in `packages/desktop` and the `window*` guard block `ipc.test.ts` was missing, plus the `detached-panels-shots.spec.ts` screenshot suite. F.3, the human multi-monitor pass, stays open — the e2e suite mocks the bridge and cannot see a second window.
- ✅ **G** ([PR #143](https://github.com/bilo-io/midnite-studio/pull/143)) — The invariants that stay single-window: metrics bound to the main window, popout crash re-docking, off-screen bounds clamped against `screen.getAllDisplays()`, and per-window logging.

### [Phase 54 — An Issues view](phases/phase-54-issues-view.md)

*Three phases have declined the same work in nearly the same sentence. `features/issues/` does not exist, and Phase 50 Theme E's Issues half plus Phase 52's carried-forward deferral are both blocked on it.*

- ✅ **A** (PR #121) — The schema learns what a detail pane needs: `id`, `milestone` — `id` first, before anything needs it. `body`/`commentCount` did not land; see the phase doc's own correction.
- ✅ **B** (PR #122) — `gh issue view`, plus issue comments reusing the REST path and parser the Reviews page already uses.
- ✅ **C** (PR #126) — The view itself: shell → list → detail, sized like `features/actions/` and not like `features/reviews/`.
- ✅ **D** (PR #126) — Registering a view in the places that need it, including one `FORGE_GATED_VIEWS` entry and five exhaustive `Record<ViewId, …>` maps.
- ✅ **E** ([PR #130](https://github.com/bilo-io/midnite-studio/pull/130)) — Phase 52's filter toolbar extracted rather than copied, generalised over a structural shape.
- ✅ **F** ([PR #128](https://github.com/bilo-io/midnite-studio/pull/128)) — "Add to project ▸" for issues, closing the deferral three phases old.
- ✅ **G** ([PR #128](https://github.com/bilo-io/midnite-studio/pull/128)) — Two writes and only two: comment, and close/reopen.

### [Phase 53 — The first release](phases/phase-53-first-release.md)

*Refined x1 (Theme A excluded — landed in PR #155). Most claims held: `git tag` is still 0, `midnite-apps` still has zero releases and `"version": null`, and all four sibling-app workflow cribs are real. Five did not: **Theme A's own PR shipped a sixth hardcoded version site** (`resources/bin/midnite-studio:32`), the raw updater error is **already** surfaced in Settings (the blind surface is the pill), `updateChannel` is renderer-only so main cannot read it at boot, the release skills invoke **six helpers that exist nowhere** and carry an unimplementable changelog precondition, and the release propagates **three** artifacts, not two — the changelog mirror is what the in-app notes popover reads.*

- ✅ **A** — The CLI wrapper ships (PR #155, 2026-09-05) — and introduced the version site Theme B now owns.
- ◻ **B** — Lockstep as a check: a seeded root `CHANGELOG.md`, a `version-check.mjs` grouping by `MAJOR.MINOR` (root `moon.yml` has exactly one task today), the CLI wrapper's hardcoded `0.1.0` derived rather than checked, the six missing skill helpers ported into `version.ts`, and `extractChangelogSection`'s `.date` precondition reconciled with a helper that returns `string | null`.
- ◻ **C** — `verify-dist` learns the feed: `latest-mac.yml`, `.blockmap` and `CFBundleShortVersionString`, on top of the **ten** gates it has today (PR #155 added two, not one) — and the version skew it reads but never compares.
- ◻ **D** — Tag-triggered `release.yml`: cross-repo publish under the namespaced tag with a `RELEASES_REPO_TOKEN` that **does not exist yet**, `contents: write` (CI's `package` job holds `read`), and four guards cribbed from the sibling — each of which cost it a broken release, one leaving an untagged draft.
- ◻ **E** — The feed stops being manual: a second job committing `latest-mac.yml` into a directory that holds only a README today, **plus the changelog mirror**, ordered after the assets exist — and the ⚠️ banner de-staled across **six** skill files, not two.
- ◻ **F** — v0.1.0 end to end through both skills, installed via `midnite-studio/install.sh` (not the repo root) on a machine with no checkout, with the pre-release "no published release yet" message captured first so the change is proven.
- ◻ **G** — The updater observed working: an error affordance in the **pill** (Settings already has one), the channel surviving a relaunch (renderer-only today — a design fork, not a one-liner), and the `stable → 'latest'` mapping's *reason* written down, since the test exists but `ERR_UPDATER` appears nowhere in the repo.
- ◻ **H** — Signing wired and honestly blocked: **five** secrets documented in a `docs/RELEASING.md` both skills already reference and which does not exist, the unsigned path proven green, and the silent notarization skip made visible before a mistyped secret ships an unnotarized release.

### [Phase 52 — Projects, the Board, and Workflows, navigable](phases/phase-52-projects-navigation.md)

*The filtering, grouping and sorting Phases 40, 41 and 50 each declined in the same words — built entirely client-side over values already on `ForgeProjectItem`, with no new IPC.*

- ✅ **A** (PR #116) — One filter toolbar shared by Table and Board: text search plus assignee/label/type/state facets, with truncation kept honest. `filterItems(items, filter)` landed without the doc's own `fields` parameter — no facet reads a `dataType`. Caught and fixed a real gap in `e2e/projects.spec.ts`'s own fixture (missing `body`/`labels`) the same way `kanban.spec.ts` already had to once.
- ✅ **B** (PR #116) — Group by any single-select or iteration field, replacing the match on the literal name `Status`; iteration grouping is read-only, folded into the existing `writesEnabled` gate with a `disabledReason` string rather than a second disabled path. The synthetic "No status" column reads `No <field name>` now.
- ✅ **C** (PR #116) — Tri-state sortable table columns, one comparator per `dataType`, single-select following option order. **Correction:** iteration sorts by `title`, not "start-date" — the value schema carries no start date and this phase adds no schema field to invent one.
- ✅ **D** (PR #116) — Filter/group/sort/collapse persisted — keyed by `projectId`, not `repoId`, and LRU-bounded (`touchProjectView`, off plain-object key insertion order). `ui-store` version 6 → 7.
- ✅ **E** (PR #120) — The Workflows list and run history learn to filter, reusing Theme A's `FilterInput`/`MultiSelectMenu` primitives verbatim.
- ✅ **F** (PR #120) — Workflows adopts `panel-stack` (Inspector → History → Run), the consumer its own docblock has been naming since Phase 42 — the first *heterogeneous* one, closer to Councils' `CouncilEntry` union than the single-kind card panel-stack.
- ✅ **G** (PR #120) — The board becomes keyboard-navigable: roving tabindex, arrow keys, Enter/Escape, and focus rescued when a filter *or a column collapse* hides the focused card. `useDraggable`'s own default `tabIndex` — a second Tab stop this app's unused keyboard sensor would have left behind — is overridden explicitly.

### [Phase 51 — The terminal, made steady](phases/phase-51-terminal-steadiness.md)

*Seven causes, not three symptoms: the DPR the repo never read, the cell metrics it never set, the WebGL context it never got back, the fit it never coalesced, the keystrokes it dropped, the backpressure it never had, and the reattach it never offered.*

- ✅ **A** (PR #115) — Text that survives a change of display: a `devicePixelRatio` watcher, then clear-atlas → fit → refresh.
- ✅ **B** (PR #117) — Explicit cell metrics (`lineHeight`, `letterSpacing`, weights) plus font family/size/line-height in Settings, applied live.
- ✅ **C** (PR #123) — One renderer story: a process-wide xterm WebGL budget every mount site reports to, with a retry-once on context loss.
- ✅ **D** (PR #118) — A resize that costs one fit per frame, not one per observation.
- ✅ **E** (PR #119) — A bounded pre-ready input queue, so a keystroke typed before the shell paints is never silently dropped.
- ✅ **F** (PR #123) — Backpressure on the input direction: honour `socket.write()`, drain, and stop swallowing a failed `pty.write`.
- ✅ **G** (PR #131) — A previous run's session opens as a live pane, the reattached note is clickable, and the dead `attach` message leaves the protocol.

### [Phase 50 — Kanban & Projects, Follow-Through](phases/phase-50-kanban-projects-followthrough.md)

*Six gaps Phases 40–42 each named and declined to build: a card session that outlives its agent, an
opt-in one-click launch, the missing "clear the Status field" mutation that makes "No status" a real
drop target, `panel-stack` finally reaching the surface its own docblock named as consumer #2,
"Add to project" from the Reviews page, and activity markers for the three agents this app already
runs unattended that have never had any.*

- ✅ **A** ([PR #93](https://github.com/bilo-io/midnite-studio/pull/93)) — A card's session survives its agent: the binding is kept and the pane renders `Ended` with the scrollback still reachable, cleared only by an explicit Dismiss. `dismissCardSession` drops `surface`/`taskRef` the way `rehomeSession` already did rather than ending a session that may still be live, and `countLiveCardSessions` soft-*warns* — never blocks — at 5 concurrent card sessions on this board, ignoring asleep, main-surface and other-board sessions.
- ✅ **B** ([PR #93](https://github.com/bilo-io/midnite-studio/pull/93)) — "Launch and run" beside Start, absent entirely behind a default-off `Settings ▸ Projects` toggle and confirmed every time against the verbatim composed command even when on. Both buttons funnel through one `launch(autoSend)`, so the only thing that differs between them is the trailing `\r` — asserted in both directions.
- ✅ **C** ([PR #93](https://github.com/bilo-io/midnite-studio/pull/93)) — `clearProjectV2ItemFieldValue` in `gh-project-write.ts` plus its own channel, and "No status" becomes a real droppable column. Clearing a field is a different mutation from setting one, which is precisely why Phase 41 Theme C had to leave the column permanently disabled; both the drop and "Move to ▸" now route to `clearField`, asserted against `setField` rather than merely for a successful call.
- ✅ **D** ([PR #93](https://github.com/bilo-io/midnite-studio/pull/93)) — The card-detail pane adopts `panel-stack` (`Mod+[`/`Mod+]`, a breadcrumb), the consumer #2 that primitive's own docblock named. One `usePanelHistory` per open pane — reset on close, so no module-level store is needed — joining Councils in `active-panel.ts`'s registry, with a Back navigation reported up so the board's own selection stays in sync and the pane closing rather than rendering blank when its current entry drops out of `items`.
- ✅ **E** ([PR #101](https://github.com/bilo-io/midnite-studio/pull/101)) — "Add to project ▸" from a PR's Reviews detail pane, closing the gap `addItemToProject`'s own docblock named; PRs only, no Issues view exists yet. A real-board human pass confirming the item lands on github.com stays open.
- ◐ **F** ([PR #101](https://github.com/bilo-io/midnite-studio/pull/101)) — Activity markers (`thinking`/`frameEnd`/`awaitingInput`) authored for `agy` and `opencode`, captured from real sessions — today only `claude` had any, so every other agent's card glow and FAB pulse read a permanently mute signal. `codex` stays unset: it needs an interactive `codex login` this pass had no business driving unattended, left honestly unset rather than guessed. A human pass verifying the live transition (and a captured `codex` transcript) stays open.

### [Phase 49 — Onboarding a repo: Setup and Update](phases/phase-49-repo-onboarding.md)

*The midnite menu's first two entries that are about the **repository** rather than about an agent
working in it. Nothing under `packages/` has ever written a `.midnite/` directory — the only prior
art is a skill that is stale by a rename (`midnite-setup` still emits `todo/`) — so A builds the
checked-in kit and stops the app and the skill disagreeing again; B and C are the contract and the
writer, where a hash manifest in `.midnite/settings.json` turns a re-run into an upgrade rather
than a guess and a file with no provenance is never overwritten; D is the modal that makes "what
will change" answerable before a byte lands. E is the honest half of Update: `install-local.mjs`
`ditto`s **this** repo's build into `/Applications`, so the command means something in exactly one
checkout, and the leaf detects that and disables itself with a reason everywhere else.*

- ✅ **A** — The onboarding kit: a checked-in `templates/midnite/` skeleton (tracker, eight repo-agnostic skills, agent-file stubs, `.agents`/`.codex` mirrors), shipped into the packaged bundle via `electron-builder.yml`, plus un-staling `midnite-setup/SKILL.md` so app and skill emit the same layout. (PR #51)
- ✅ **B** — The contract in `shared`: `ScaffoldPlan`/`ScaffoldEntry`/`ScaffoldApplyResult` zod schemas, the `.midnite/settings.json` hash manifest, two IPC channels (keyed by `repoId`, not a raw path) on the house `{ok}` envelope — zod only, no template bytes. (2026-09-03)
- ✅ **C** — Plan and apply in main: sha256 classification into create/unchanged/stale/locally-edited, confinement through Phase 24's existing `fs-scope-write.ts` (a new `ensureConfinedDirs` there, since a fresh repo has neither `.claude/skills/<name>/` nor `.midnite/tasks/phases/` yet), re-check before write, manifest written last so a crash leaves the truth on disk. `unchanged` corrected to a direct hash match against the template — requiring the manifest too would call a byte-identical file something else whenever the manifest disagreed, for no different outcome. (2026-09-03)
- ✅ **D** — The Setup dialog: a modal preview with counts by status, locally-edited rows visibly excluded, and re-run wording that reads as an upgrade — no new modal system, no new ViewId (not literally `ConfirmDialog`, whose `body`/`warnings` props can't express a grouped file list). Found building it: rendered inline inside the (virtualized) repo row, its `fixed inset-0` overlay was contained by a transformed ancestor instead of the viewport — the screenshot caught it, RTL never could — fixed with a `createPortal` to `document.body`. (2026-09-03)
- ✅ **E** ([PR #104](https://github.com/bilo-io/midnite-studio/pull/104)) — Update, capability detection and the menu: a sixth `project` group, `isMidniteStudioCheckout` gating Update with a `disabledReason` elsewhere, and the command **typed, not executed**. Two real corrections: `AgentCommandId`/`DEFAULT_AGENT_SKILLS` do NOT widen — Setup and Update are built directly in `midnite-menu.tsx`, since neither is a user-configurable skill the way every other leaf is; and `startAgent` is the wrong mechanism entirely — it always wraps its prompt as an argument to an agent CLI (`claude '…'`), which would have typed `claude 'moon run desktop:install-local'` instead of the bare command. `repo-lifecycle.ts`'s `runLifecycleAction` (the doc's own precedent) is what Update actually mirrors: a plain shell session, command queued raw. Closed out (2026-09-03): a pre-flight tooltip naming the build cost when `hasPackagedBuild` is false — a `ContextMenu` `description` was considered and rejected, since that component's rule is every row of a menu is described or none, and this menu's rows are all undescribed — re-read when the Update session exits; and a packaged-build assertion of Theme A's own named risk, landed in `verify-dist.mjs` (already in CI's `package` job) rather than a new script. (2026-09-03)

### [Phase 48 — Apply suggested-change blocks](phases/phase-48-apply-suggested-changes.md)

*GitHub's ` ```suggestion ` fence, rendered specially the way `slide-code.tsx` already renders any
tagged fence, then applied straight to the local working tree rather than pushed as a commit
through GitHub's API — the local-first move the web UI can't make. A and B parse the fence and
resolve the multi-line range `startLine`/`line` already describe but nothing reads yet; C is the
phase's real weight, detecting whether the local file still matches what the suggestion assumes,
since the existing outdated-thread check only ever covered drift on GitHub's side; D renders the
preview and wires Apply to Phase 24's existing whole-file write, never auto-staging; E wires it up.*

- ✅ **A** — Suggestion detection: a pure `extractSuggestion(body)` parsing the comment's markdown AST for a ` ```suggestion ` fence, prose-tolerant, tested against multiple/absent/wrapped cases. (PR #51)
- ◻ **B** — Line-range resolution: `(startLine ?? line)` through `line`, `RIGHT`-side only — the first consumer of `startLine`, which every existing thread renderer currently ignores.
- ◻ **C** — Local-file divergence detection *(the phase's real weight)*: compares the file's current content at the resolved range against what the suggestion assumes, disabling Apply with a named reason on mismatch, deletion, or an already-`outdated` thread — stricter than and separate from `fsWriteFile`'s own staleness check.
- ◻ **D** — Rendering + the write: a `code`/`pre` override on `CommentBody` styled off `DiffCell`'s tokens, an Apply button calling the existing `fsWriteFile` IPC with no new write channel, never auto-resolving the thread.
- ◻ **E** — Wiring + verification: the full apply path end to end, each Theme C refusal path asserted individually, and repo-scope containment reused from `fs-scope-write.ts`.

### [Phase 47 — Conflict Resolution Studio](phases/phase-47-conflict-resolution-studio.md)

*The gap [Phase 8](phase-8-drag-drop-ops.md)'s conflict banner left open and
[Phase 26](phase-26-side-by-side-diffs.md) deliberately declined to close in passing — resolving a
conflict today means leaving the app entirely. A is the parser that turns opaque markers into
structure; B is the safe whole-file baseline; C is the phase's real risk, a net-new write path
through the index for hunk-level patches; D is the UI those three feed; E reuses Phase 34's
council-run IPC for an advisory-only suggestion; F wires it up and proves the ours/theirs
inversion across merge vs. rebase.*

- ✅ **A** ([PR #63](https://github.com/bilo-io/midnite-studio/pull/63)) — Conflict data model + parser: `shared/src/domain/conflict.ts` (`ConflictRegionSchema`/`ConflictedHunkSchema`, zod only) and `git-engine/src/parsers/conflict-parser.ts` splitting a combined diff's raw marker text into structured context/conflict segments, supporting both the default and `diff3` conflict styles. Round-tripped against real git merge output for both styles, not just hand-written fixtures; a markerless file parses to zero regions rather than throwing.
- ✅ **B** ([PR #64](https://github.com/bilo-io/midnite-studio/pull/64)) — Whole-file resolution: `resolveConflictWholeFile` reads `:1:`/`:2:`/`:3:` blobs via the existing binary-safe `readBlob` and stages via the existing `stagePaths` — tested against merge **and** rebase, since git inverts "ours"/"theirs" between them; the function passes git's own convention through unmodified rather than correcting for it, and the tests are what prove that's still right.
- ✅ **C** ([PR #103](https://github.com/bilo-io/midnite-studio/pull/103)) — Hunk-level patch application *(the phase's biggest risk — zero precedent anywhere in the repo)*: `applyConflictHunk` synthesizes a single-hunk patch from a freshly re-read `ConflictRegion` + `regionIndex` and applies it with a plain (worktree-only) `git apply`, leaving sibling hunks in the same file still conflicted until each is resolved, then stages the path once none remain. Corrected from the doc's own plan mid-build: `git apply --index`/`--cached` cannot target an unmerged path at all (no stage-0 entry exists), confirmed against a throwaway repo before writing any code.
- ✅ **D** ([PR #107](https://github.com/bilo-io/midnite-studio/pull/107)) — The Studio UI: opens from a clickable path in `ConflictBanner`, in the graph's existing side-panel slot beside `CommitDetail`/`StashInspector`. Per-region Accept mine/theirs/both onto Theme C's `applyConflictHunk`, file-level Accept-all onto Theme B. Narrowed from the doc's plan: plain monospace rendering, not `DiffCell`'s virtualization/shiki — a three-sided region doesn't fit `SplitRow`'s two-way model, and stretching it cost more than a new render did. A new read-side IPC (`mstudio:conflict:regions`) was needed since nothing had ever exposed parsed regions to the renderer; its response carries a `truncated` flag, self-review having caught `readFileDiff`'s line cap silently dropping trailing regions from a large conflicted file.
- ✅ **E** (PR #133) — Agent-assisted suggestion: reuses Phase 34's `mstudio:council:run:start` unchanged; advisory text only, never auto-applied.
- ◐ **F** ([PR #111](https://github.com/bilo-io/midnite-studio/pull/111)) — Wiring + verification, partial: `conflict-flow.integration.test.ts` (real git) proves a merge mixing one whole-file accept and one region-by-region file reaches a completed merge commit, and that Theme B's and Theme C's own "ours" conventions agree with each other inside the same rebase — an integration risk neither theme's own isolated suite could see. New RTL coverage closes a real gap: "Accept theirs"/"Accept both"/"Accept all theirs" had no payload-asserting test before this pass. **Open, for a human**: a real conflict against a locally-set `merge.conflictStyle = diff3`.

### [Phase 46 — The lock screen, and a motion policy that holds](phases/phase-46-lock-screen-and-motion.md)

*Empties [`_features.md`](../_features.md): its whole **Lock Screen** section plus Improvements #3,
the last two entries once 40–44 took the numbered list, Phase 36 took #2 and Phase 45 took #1. The
two halves are one surface — `features/screensaver/` is **1 344 lines across seven files that no
phase doc has ever named** (a scan of all 45 returns zero hits for "lock screen", "screensaver" or
"weather"), and it is also the app's densest animation. Reduced motion has meanwhile never been a
theme of its own: **37 F, 39 G (still `◐ PARTIAL`) and 42 F each carry it as a trailing (S)** —
three phases ending on the same unfinished item is a policy with no owner and no test. Reading the
tree found the proof: `@keyframes pill-shimmer` and `.pill-shimmer` are **each declared twice**
(styles.css 143/152 and 539/548), with **different guards on each copy**. Renderer-only — battery
already rides the metrics sample and weather is a `fetch`, so no IPC, no main, no `git-engine`.*

- ✅ **A** ([PR #55](https://github.com/bilo-io/midnite-studio/pull/55)) — Weather, top centre. A `features/weather/` module shaped like `features/finance/` (same react-query shape, its own `staleTime`/`refetchInterval`), **Open-Meteo, keyless**, location a search-by-city stored preference that renders **nothing** until set and nothing on a fetch failure, slotted `top-centre` via Theme D's already-landed corner layout. The query gate is mounting itself — the widget is only ever in the tree while the lock screen (or the landing page) is genuinely showing it — rather than a literal `enabled: screensaverOpen` boolean, matching the ungated posture the sibling fintech/sysmon widgets already have.
- ✅ **B** ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) — Battery, bottom right, and the audit's happiest find: **pure reuse**. `features/battery/` already ships the icons, styling and panel, and `BatteryReadingSchema` is already an optional field on the metrics sample — no new IPC, no new sampling, no new schema. The only real decision is the corner collision with the existing sysmon widget.
- ✅ **C** ([PR #55](https://github.com/bilo-io/midnite-studio/pull/55)) — Pills that navigate, where the destination turned out to be the interesting half after all. The four `PILLS` are real **buttons** with real destinations (repos → reveal the repos panel, agents → reveal the terminal, PRs → reviews — `repos` corrected from the doc's `setActiveView('repos')`, since there is no `'repos'` `ViewId`). **Intent survives the passcode pad** — held in local state, applied on unlock, **dropped on cancel** — via a second, independent `PasscodeUnlockDialog`. Found only by testing in a real browser: `LockScreen`'s own "any key opens my dialog too" listener popped a *second* redundant dialog when the pill's own code was typed (fixed with a new `suppressUnlockTrigger` prop), and the pill's dialog first sat *under* `LockScreen`'s own backdrop as a sibling portal, eating every click (fixed by nesting it in `LockScreen`'s children instead).
- ✅ **D** ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) — The corner layout becomes data: one declared slot map replacing three hard-coded `absolute` positions across two files, *before* this phase adds two more surfaces to them. `LockScreen`'s existing `corners` prop is already the right seam. A map, **not** a drag-and-drop layout editor.
- ✅ **E** ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) — The motion audit the last three phases each punted. **One dialect** — `@media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) … }`, the only form that honours the OS *and* lets an explicit `Motion: full` opt back in — the duplicate `pill-shimmer` block deleted, all **16 `@keyframes` swept against the 18 guard rules** with a published table, and `NeuroCloudBackground` taught to consult the setting itself, since a canvas rAF loop is what CSS guards cannot reach. First job is to observe which value actually lands on `<html>`: **two hooks write `data-motion` and only one resolves `'system'`**, which is the store's default.
- ✅ **F** ([PR #53](https://github.com/bilo-io/midnite-studio/pull/53)) — A guard that can't be forgotten, and the reason this is a phase rather than a drive-by CSS fix. A unit test over `styles.css` asserting every `@keyframes` is guarded or explicitly allowlisted **with its reason**, plus a no-duplicate-name assertion for the bug this phase found by reading. Modelled on `icon-names.test.ts`, the in-repo precedent for a convention with a test behind it. Three phases left a motion item unfinished because nothing failed when they did. One item deliberately left `◻`: an assertion on Theme A's query gate, which doesn't exist as a literal boolean to assert on (see A).
- ✅ **G** ([PR #63](https://github.com/bilo-io/midnite-studio/pull/63)) — Verification and screenshots. `lock-screen-shots.spec.ts`: a committed, `MSTUDIO_SHOTS`-gated spec shooting the full lock screen (weather, battery, sysmon, pills) across both motion modes and both themes — 4 shots, replacing PR #55's ad hoc throwaway-script PNGs, only this phase's PNGs committed per `outstanding.md`'s non-byte-reproducible warning. The Phase 38 `ControlOrMeta` lesson doesn't apply: the spec presses no modifier chords. The phase's remaining open items are the `## Verification` section's human keyboard/eye passes — the same posture Phases 36/37/39 left theirs in.

### [Phase 45 — The leak audit](phases/phase-45-leak-audit.md)

*Closes the one gap [`scripts/perf/README.md`](../../scripts/perf/README.md) declares open in a
section called "What is not measured here": renderer heap, which *"needs a DevTools heap snapshot …
because a heap number without the diff that produced it is not comparable to anything."* That
sentence is right, and it is why nothing has been measured since — so this phase does for retention
what Phase 36 did for startup, bundle and idle CPU: turns the last human-only metric into a script
with a budget, then spends the instrument on what it finds. Phase 36 Theme F already swept the
renderer and is not repeated; **`packages/desktop` was never audited** and holds 35 top-level
Map/Set allocations. A sweep found **six real leaks, two byte-heavy** — and `git-engine` clean
throughout.*

- ✅ **A** — The instrument: `memory-report.mjs`, driven through the existing `electron-run.mjs` (**not** `_electron.launch` — "one launcher, one number"), attaching CDP to the already-launched app to drive the four named actions through the real bridge, measuring main, renderer and broker **separately**, and reporting a **slope** — bytes retained per cycle — rather than a level. Ships an `MSTUDIO_PERF` heap sampler in main and the broker too. (PR #49)
- ✅ **B** — The sweep with verdicts, applying Theme F's own rule verbatim rather than inventing a second one — table in the phase doc. `git-engine` audited and confirmed clean; a bounded documented cache is a **pass**, not a thing to cap on sight. (PR #49)
- ✅ **C** — The headline leak, and the only one whose severity comes from *where* it lives: the broker's `scrollbackBySession` was **2 MB per session, never deleted**, in a process that deliberately **outlives the app**. Fixed with a new `ControlMessage` arm plus delete-on-exit/kill and a reconcile-on-reconnect backstop — verified with unit tests confirmed to fail against the unfixed code, since the leak turned out too small to see over a live RSS sample. (PR #49)
- ✅ **D** — Two run histories capped on disk and unbounded in memory: `council-service.ts` and `loop-runs.ts` both trimmed only the copy written to disk and never reassigned the trimmed array back. Fixed by capping at write time in both, independent of the store's own trim. (PR #49)
- ◐ **E** — The small ones, each with the assertion that catches it: `runLocks` never pruned (the `evictIfCurrent` idiom already exists in `write-queue.ts`), two `.then`-without-`.catch` sites that retain a handle *and* raise an unhandled rejection, `dropKey` missing one of thirteen per-session records (fixed **structurally** — its `Pick<>` was a hand-written list a fourteenth would slip past just as quietly), a closed browser tab's un-detached `webContents` listeners, and an unbounded `workflowCache` now sharing the run cache's LRU. **Partial**: `sessionExitHooks`'s own append-only gap is recorded but left open — no second caller has appeared to justify an `off`. (PR #51)
- ◐ **F** — Verification, run for real: `retention.spec.ts` extended to `repo`/`browser-tabs` (`terminal` already there) and actually executed — finding and fixing a harness export bug and a false-positive `browser-tabs` slope (10-cycle Chromium subprocess-pool warm-up, confirmed flat at 20). Every Theme C–E fix's assertion verified to fail against the unfixed code. **Partial**: the human long-running-session pass is still open. (PR #51)

### [Phase 44 — Video Studio](phases/phase-44-video-studio.md)

*The fifth and last product feature in [`_features.md`](../_features.md), after 40–43 took items
1–4. A Video view that turns a brief into a rendered video, with Remotion drawing and Claude
writing. Its one load-bearing decision is that **the app ships no Remotion dependency**: a video
project is a real npm project on disk, driven from outside exactly as `gh` and `claude` already
are, because the asar carries only two esbuild bundles and `@remotion/renderer` needs ~210 MB of
on-disk binaries. So the app is a host and a project manager, and the timeline editor is Remotion
Studio itself — a localhost dev server, hosted in the `WebContentsView` engine Phase 32 already
built. A is the contract, B–C what it finds and starts, D the room, E–G what you do in it, H the
wiring.*

- ✅ **A** (PR #110) — Shared contracts: `Video*` zod schemas mirroring `ekko-videos`' `project.json` verbatim so a project folder is portable in both directions; studio status as a discriminated union, because a studio with no URL yet is a state, not a null field. **Correction:** this row previously cited `PR #92` — that PR is Phase 43 Theme A/B/C/D's (`shared/src/workflow.ts`), not this phase's; `shared/src/video.ts` did not exist until this PR. Stale copy-paste, not a real landing.
- ✅ **B** (PR #112) — Projects are **discovered, not registered**: scan `<root>/projects/*/project.json`, jailed through the existing `fs-scope.ts`. The store persists one setting — the root. Mirrors drift; pointers do not. Two bugs the tests caught: the containment check used on `source`/`brief`/`script` originally required the file to exist (`confineToRoot`'s `realpath`), wrongly failing a fresh project whose files aren't written yet — switched to the pure, existence-independent `joinWithin` for those three; and `readdir`'s `Dirent.isDirectory()` reports `false` for a symlinked folder, which silently skipped a symlink-escape project instead of reading and refusing it.
- ✅ **C** (PR #113 + PR #134) — Toolchain probe through the existing `login-shell.ts` (batched/framed the way `agent-probe.ts` probes the agent roster), and a studio host owning at most one `remotion studio --no-open` per project. Port discovery **reads stdout rather than assuming 3000**, matched against the real `@remotion/studio-server` source rather than assumed, and a studio that dies transitions to a rendered `failed` state and stays restartable. The kill-by-process-group mechanism is now wired: `stopAllVideoProcesses()` runs from `main/index.ts`'s `before-quit` handler (Theme H).
- ✅ **D** (PR #134) — The Video view: a new `ViewId` (which touches **eight** files — the doc lists all of them, `nav-icons.ts` being an exhaustive `Record` that fails typecheck), three panes, and the studio hosted in the centre via the browser pane's own `use-browser-bounds`. Six rendered centre-pane states, not the five originally enumerated — a "select a project" `EmptyState` with none chosen. Lazy behind the same Suspense boundary as every other view, confirmed by grepping the built manifest: its own ~17 KB chunk, never in the entry.
- ✅ **E** (PR #113 + PR #134) — Renders through the existing `process-runner.ts` (`runProcess` at a 20-minute deadline, not the bare 120s default), which already does detached spawn and process-group kill — the thing that stops an orphaned headless Chrome. Progress parsed straight out of Remotion's own CLI text, weighted 70/30 render/encode the way `@remotion/renderer`'s own `render-media.js` does internally. **Correction:** Theme A's landed event schema carries no `phase` field, so this is one combined fraction, not a `bundling|rendering|encoding` enum. The output-listing pane (size + mtime) and changelog rendering now land, plus reveal-in-Finder/play-in-default-app through a new video-scoped `shell` hand-off — the existing repo-scoped `mstudio:shell:show-item-in-folder` channel couldn't be reused since a video root is neither a repo nor registered anywhere.
- ◐ **F** (PR #134) — Claude in the loop: the two `ekko-videos` skills (brief → editorial script → compositions), launched **type-don't-send** per the app's standing posture. **Correction:** deliberately does NOT route through Phase 35's `DEFAULT_AGENT_SKILLS` — that store's menu launches with the *currently open repo's* `cwd`, never a video project's, which would silently run these in the wrong directory; a local `VIDEO_SKILLS` constant carries the two `/command` invocation strings the doc itself names, not a hand-rolled prompt body. **Open:** no presence check for the two skills in the video root's own `.claude/skills/`, and `BRIEF.md`/`EDITORIAL_SCRIPT.md` stay read-only rather than opening in the existing editor — both recorded gaps, not silent ones.
- ✅ **G** (PR #134) — Assets: run the project's own `sync-assets.mjs`, list `assets/` and `input/` read-only, shared with E's `output/` listing (`video-file-list.tsx`). Nothing writes. **Correction:** reuses only `FileIcon`/`FolderIcon`, not the explorer's writable `FileTree` — that component's rename/create/delete affordances have no use here.
- ◐ **H** (PR #134) — Wiring: handlers, preload, hooks (`use-video.ts`, matching the councils/workflows precedent of a dedicated file), a `view.video` command, a Settings entry for the root, `stopAllVideoProcesses()` wired into `before-quit`, and the four unit tests covering the places this phase can be wrong silently — the port parser, the progress parser, the `project.json` round-trip, and the containment refusal (now including the new reveal/open hand-off's own). `mock-bridge.ts` gains `video.*` fixture support and a real Playwright e2e spec plus screenshots (`video-studio.spec.ts`, `video-studio-shots.spec.ts`) — **caught a real bug in the process**: a fixture that pre-seeds a project's studio as already `failed` never reached the UI, because `useVideoStudioStatus`'s `initialData` plus `app.tsx`'s global `staleTime: Infinity` mean the first real `status` fetch never runs on mount — a fixture-seeded status can only reach the UI through `studio.start`'s own response, exactly the path production uses too, since studios only ever change state through an explicit mutation or push event. **Open:** no palette entry per project/per action — only the standard view-navigation entry every view gets, since per-item entries need project *selection* lifted out of `VideoView`'s local state first. **Open, for a human:** the real interactive pass against `~/Dev/ekko-videos` with `ps`-checked process cleanup on cancel/quit.

### [Phase 43 — Workflows](phases/phase-43-workflows-mvp.md)

*Fills the `workflows` ViewId that has rendered `<Placeholder>` since Phase 19, the way Phase 34
filled the identically-reserved Councils slot. A workflow is a graph of five node kinds, built on
a hand-rolled SVG canvas and run manually; its centre of gravity is HTTP, so D ships a real local
`node:http` CRUD API to build against — a workflow engine with nothing to call is a diagram. A is
the contract, B the engine, C–D what it calls, E–F how you build one, G–H how you watch and keep
it.* **Refined x1 (2026-09-02):** 57 → 77 items, every open decision resolved, and **four false
precedents corrected** — there is no pan/zoom anywhere in the app and the commit graph is not a
canvas; `council-runner.ts` emits no events at all (councils poll); `WORK_IN_PROGRESS` is a sidebar
filter preset a global view already has right, not a placeholder; and `.loop-run-glow` is **not**
covered by Phase 37's focus gate. E is re-tagged the phase's largest risk: pan/zoom, free 2-D drag,
multi-select and undo/redo each have zero precedent in this renderer.

- ◻ **A** — Shared contracts: `Workflow*` zod schemas, nodes as a discriminated union of exactly five kinds, channels + one bare `workflowRunChanged` event. Copies `GitOpResult`'s nested-union shape exactly — a flat `discriminatedUnion('ok')` is a zod error — and adds the opt-in `describe('workflow contract')` block to `ipc.test.ts` without which a channel ships unvalidated.
- ✅ **B** ([PR #92](https://github.com/bilo-io/midnite-studio/pull/92)) — The engine: Kahn topological order, parallel branches capped at 4 in flight, cycle detection before the first node runs, a 120 s per-node deadline via the `trackOneShot` race, and `withRunLock` copied verbatim — including the never-nest rule that avoids deadlocking it against itself, and the `runLocks` prune the councils original still lacks.
- ✅ **C** ([PR #92](https://github.com/bilo-io/midnite-studio/pull/92)) — The HTTP executor: every verb, a written-down `{{node.field}}` grammar with a `{{{{` escape where an unresolved reference **fails the node** rather than substituting empty, a 512 KB cap reusing `appendCapped`'s visible `truncated` flag, and `transform`/`condition`/`delay` bounded in schema.
- ✅ **D** ([PR #92](https://github.com/bilo-io/midnite-studio/pull/92), [PR #109](https://github.com/bilo-io/midnite-studio/pull/109)) — The demo CRUD API: `node:http` on `127.0.0.1` and an **ephemeral port** (`listen(0)`) — the draft said both that and a fixed `:7331` — in-memory collections capped at 1 000, every verb and the right status codes. On demand, off by default. **The one-click base-URL paste** landed as a `Demo API · running on :<port> · [stop]` pill in the canvas toolbar, polling `demoApi.status` (no push event shipped with it) and inserting the base URL into a selected `http` node's URL field.
- ✅ **E** ([PR #100](https://github.com/bilo-io/midnite-studio/pull/100)) — The canvas *(the phase's largest risk)*: SVG nodes + bézier edges, with the geometry split pure the way `metric-path.ts` is. `edgePath` is the bezier to **copy, not call** — its control axis is vertical and a workflow flows sideways. Pan/zoom is defined here, not inherited; drag is **raw pointer events, not `@dnd-kit`**; culling is a rect filter, not a virtualizer.
- ✅ **F** (PR #102) — The node inspector: forms driven off the `kind` union in the app's **first** right-hand config pane, live validation via the existing `validateWorkflow()` (not a bare zod schema — that catches nothing an empty URL/picks/right-hand value would need), and a `{{...}}` interpolation helper listing genuine upstream fields by their declared output shape. Hoists `Field`/`Choice`/`TextField`/`TextArea` into `components/form/` rather than making a third copy; `SwitchRow`/`RadioRow` turned out already hoisted by Phase 41 Theme G. Does **not** build or consume `panel-stack`.
- ✅ **G** (PR #105) — Runs: the same canvas read-only with per-node status colouring (stroke, not text), live via **push-then-re-fetch** off `workflowRunChanged` (councils' 1 200 ms poll would look frozen). History is a Popover off the canvas toolbar, per-workflow-capped at 20 (`workflow-runs-store.ts`'s real cap — not the 200-global the doc guessed before that store existed). A run's status/duration/error render in the inspector's pane, swapped by mode; the doc's "input" was never a real field on `WorkflowNodeRunSchema`, so it isn't shown. The running indicator wears `.card-run-glow` (not `.loop-run-glow`'s tab-hued system, which predates it) and calls the shared `useWindowFocusGate` itself — already concurrent-host-safe, no `app.tsx` hoist needed.
- ✅ **H** ([PR #92](https://github.com/bilo-io/midnite-studio/pull/92), [PR #100](https://github.com/bilo-io/midnite-studio/pull/100)) — Persistence + the list: two `*-store.ts` files under `userData` (separate write profiles), `workflow-handlers.ts` taking the `getWindow` thunk, hooks feature-local rather than in `queries.ts`, and `workflows-view.tsx` replacing the `<Placeholder>` — inserted **before** `app.tsx:961`'s repo guard, or a global view shows `EmptyWorkspace`. **Its two stores and `workflow-handlers.ts` landed early with B/D** (PR #92); the renderer half — the list, create/duplicate/delete/import/export, and `noBridge`/`reportFailure` hoisted out of the councils hooks into `bridge-result.ts` — landed with E (PR #100). Last-run status per row is deferred to G, which owns the run-history data this would read from.
- ◐ **I** (PR #108) — Wiring + verification: a chord-less `workflow.run` command, which turned out to need `PALETTE_SAFE`'s allowlist too (declaring it in `COMMANDS` alone left it undiscoverable — caught by an e2e run against the real palette) and a new `workflow-run-command-store.ts` seam (the `commit-box-store.ts` shape) since "which workflow is open" is local view state. The settings page (default timeout, run-history cap) reaches main for real over a new one-way `workflowSetDefaults` channel — `update.setChannel`'s shape, `EngineDeps`/`trimRunsPerWorkflow` gained injected overrides. One human-only real-network pass stays open.

### [Phase 42 — Councils, rearranged](phases/phase-42-councils-layout.md)

*Builds the `panel-stack` history primitive the app lacks, then moves Councils to three panes —
navigation left, output centre, configuration right — and gives members drag-reorder. Renderer-only:
no IPC, no main-process change.* **Refined x1 (2026-09-02):** 36 → 43 items, all three open
decisions resolved, and the motion story rewritten after two of the doc's premises turned out
backwards. The global reduced-motion reset **does** exist but lives in `@bilo-io/shell`, and it
*pins animations to their last keyframe* rather than removing them — the precise accident Phase 39
Theme G shipped on. And `data-motion` reads **`'system'`** by default, not `'reduced'`, because
`useAppearanceSync` runs after `useMotionPreference` and overwrites it — so the attribute-based test
can pass while the default path stays unverified. Three other items turned out to be greenfield with
no precedent at all: collapse-to-a-rail, the responsive overlay, and mouse back/forward buttons.

- ✅ **A** — `panel-stack`: a generic `usePanelHistory<T>` mirroring `viewHistory`'s push-truncates-forward shape — but **not** its `guardNavigation` wrapper, and **not** its unbounded depth, since `viewHistory` has no cap at all. Capped at 20, with the hazard named (and tested): dropping from the head must decrement the index. The slide (`panel-stack.tsx`) is **transition-driven, not `@keyframes`**, correcting the draft — no `tailwind.config.ts` edit. A module-level `active-panel.ts` registry, not named by the doc, routes the global back/forward chords (Theme D) to whichever panel is on screen, since `panel-stack` is deliberately not a store.
- ✅ **B** — Three panes. Widths are cheap — `layout` is already persisted and `merge` re-spreads it, so **no migration and no version bump** — but the collapsed flag is a top-level boolean needing four edits. The `PanelStack` slide itself was placed in the **centre**, not the left rail as drafted — the rail's own content doesn't change shape across entries, only its selection highlight does. The responsive overlay (below 900px) was **cut, per the doc's own instruction**: a hard `min-w` on the centre region instead, since it was the one item in the theme with no precedent anywhere in this app.
- ✅ **C** — Config moves right (`border-r` → `border-l`) and members reorder. `SortableList` fits here **unchanged** — the one place in these four phases where its vertical/parent restrictions are right — but needs a **drag handle**, since member cards contain three text controls a listener spread would swallow. "Flush on drop" also fixes a live bug: the debounce's unmount cleanup clears the timer without firing it, so an in-window edit is already silently dropped — extracted as a generic, tested `use-flushable-save.ts`. `council-detail.tsx` is **deleted**, not merely edited — its three concerns split across `council-config-panel.tsx` and `councils-view.tsx`'s own data orchestration. A narrowly-scoped `components/form/select-field.tsx` replaces the two identical `<select>`s in the same file; input/textarea were left alone (differing padding, no second real consumer).
- ✅ **D** — Back/forward/crumbs. Kills **two** `useState`s, not one — `selectedId` *and* `selectedRunId`, the second being why the run list is a dead end today. **Corrected the drafted `CouncilEntry` type, found by testing**: a `'run'` entry needs its owning `councilId` carried alongside it, or the centre pane cannot know which council's run list to read — without it, `councils.spec.ts`'s existing "running a consultation" spec broke the moment a run was actually started. `Mod+[`/`Mod+]` needed `TERMINAL_YIELD_COMMANDS`, not just `enabled` gating, to actually stay out of the terminal — `app` scope alone never yields to xterm. Mouse back/forward buttons **cut**, per the doc's own "cut this first" instruction.
- ✅ **E** — Councils and runs share the left rail (PR #134). `council-run-list.tsx` (new) is the
  vertical rail replacement for the old horizontal run strip, rendered by a second `PanelStack`
  sharing the centre pane's `history`. The draft's "navigating away must not detach the run" turned
  out to conflate two things, confirmed rather than assumed: unmounting **does** detach the listener,
  and that is fine — the pty is broker-owned and `pty.snapshot` replays losslessly — so nothing in
  `council-live-output.tsx` needed to change. The navigation stack itself moved to a module-level
  `councils-history-store.ts`, since Councils is lazy and unmounts on view switch; a component-local
  `useState` would have reset to the list every time.
- ✅ **F** — Motion, and proving it (PR #134). Repeated the exact mistake Phase 39 Theme G shipped on,
  then caught it before merging rather than after: `.panel-stack-pane`'s reduced-motion rule needed
  `!important` because `panel-stack.tsx` sets `transitionDuration` as an **inline style**, which beats
  any non-`!important` external rule regardless of specificity. Three `e2e/councils.spec.ts` cases now
  assert the real `transitionDuration` in all three configurations — `'reduced'`, `'full'` under OS
  reduce-motion, and the default `'system'` + OS reduce-motion blind spot, which is the one that
  failed first and caught the bug. `motionMs()` itself was left unchanged, deliberately: the blind
  spot is closed by the CSS `@media` rule alone, not by widening the JS helper.

### [Phase 41 — Agentic Kanban](phases/phase-41-agentic-kanban.md)

*Turns Phase 40's Projects table on its side as a `[ Table | Board ]` mode and gives each card a
running agent — a gradient glow while it works and a live terminal inside the card. Columns are the
project's `Status` field; a drag is a real `updateProjectV2ItemFieldValue` mutation.*
**Refined x1 (2026-09-02):** 44 → 55 items. Was a **hard block** — needed **seven** things from
Phase 40 — **resolved 2026-09-02**: Phase 40 Themes A–F landed (PRs #38, #41) and Theme A here
shipped in [PR #42](https://github.com/bilo-io/midnite-studio/pull/42), confirming the doc's own
prediction that Phase 40 Theme E's inline editors would not be reusable (Theme B builds its own).
Three further corrections stand: adding `'kanban'` to the surface enum does the **opposite** of
Theme D's promise, because `onMainSurface` is a deny-one test (`surface !== 'fab'`) and **five**
`'fab'` literals break the same way; `taskRef` is **silently stripped** by zod at `schemas.ts:1033`
unless the shared schema learns it, so it would never reach `terminals.json`; and the real ceiling
on in-card terminals is **WebGL contexts**, not DOM.

- ✅ **A** — The board shell: a per-repo persisted mode toggle, columns derived by a pure `deriveColumns` (empty status gets its own leading column, alongside an item whose option id no longer exists on the board), and **one** item read grouped client-side — every forge read in this app is `enabled`-gated because each is a subprocess plus rate-limit spend, and a per-column fetch would be the first violation. (PR #42)
- ✅ **B** — Cards: type-discriminated content (a draft has no number, so no dead link), field chips, and the app's **first per-container virtualizer** — variable-height, so the `diff-view.tsx` `measureElement` recipe, not the graph's fixed-row one. Extracted Phase 40 Theme E's inline field editors into `field-editor.tsx`, exactly as the doc's own Decision predicted; no labels row — the contract carries no labels field. (PR #43)
- ✅ **C** — Drag between columns *(was the least-precedented theme)*: `@dnd-kit` `useDraggable`/`useDroppable` (not `SortableContext` — within-column order stays read-only), `closestCorners` collision, one shared `moveItemToColumn` behind both the drop and the "Move to ▸" context menu. Found in the doing: "No status" cannot be a drop target at all — clearing a field is a different GraphQL mutation (`clearProjectV2ItemFieldValue`) Phase 40 never built. "Pause invalidation while dragging" turned out unnecessary — the optimistic move is a local overlay, not a query-cache write, so a concurrent refetch can't win the race. Gated on `forgeWritesEnabled` at the surface, like every other forge write. (e2e: `e2e/kanban.spec.ts`)
- ✅ **D** — A session bound to a card: `'kanban'` on the surface enum, `taskRef` inside the schema's object literal **and** flowing through `TerminalSaveRequest` for free (it wraps the schema rather than restating fields), all five `'fab'`-shaped surface checks fixed and tested, plus `findCardSession`/`findAnyCardSession` lookups. Completed in [PR #47](https://github.com/bilo-io/midnite-studio/pull/47): Theme G's `CardComposer` is the call site `startAgent(..., surface: 'kanban')` was waiting on.
- ✅ **E** ([PR #90](https://github.com/bilo-io/midnite-studio/pull/90)) — The terminal inside the card: through `LazyTerminalView` only (a direct import silently undoes Phase 36's lazy chunk), viewport-mounted via a new feature-detected `IntersectionObserver` hook — **new machinery**, both existing multi-xterm hosts mount everything they own — and capped at **4 concurrent instances**, because each takes a WebGL context and an evicted one degrades to the DOM renderer permanently. An off-screen or over-cap card falls back to its live activity line or a plain "open the card to watch" message. `terminal-view.tsx` gained an `autoFocus` prop (default `true`) so a genuinely-visible card terminal never steals focus on mount — the one thing `active` alone couldn't express.
- ✅ **F** — The running glow: a new `.card-run-glow` CSS class (not `.loop-run-glow` reused verbatim — a card needs one solid `loopGlowColor()` hex, not the shared rainbow ramp), three states plus an implicit idle, `useCardStatus`/`deriveCardGlowState` reading `activity === 'waiting'` off the terminal store. `BoardView` calls the shared `useWindowFocusGate` itself rather than a hoist to `app.tsx` — the hook already supports concurrent hosts. Needed an unplanned prerequisite: nothing hydrates the terminal store on board open without it, so cards never learn about live sessions at all; added a scoped `hydrate()` call, explicitly not Theme H's fuller reconciliation.
- ✅ **G** — The card composer ([PR #47](https://github.com/bilo-io/midnite-studio/pull/47)): agent picker (`RadioRow` pills, defaulting to the repo's most recent launch), a pure `composeCardPrompt` capped at 4 000 chars, the command shown verbatim. Typed-not-sent, now with the argument the draft lacked: a loop runs a prompt **you** wrote, a card runs one composed from **remote GitHub text**. `SwitchRow`/`RadioRow` hoisted to `components/form/toggle-rows.tsx`, generalised off `id`/`label`/`title` rather than `LoopModifier`.
- ◐ **H** — Binding survives a restart ([PR #47](https://github.com/bilo-io/midnite-studio/pull/47), [PR #114](https://github.com/bilo-io/midnite-studio/pull/114)): `sessionsToRehome` (pure, tested) + a new `rehomeSession` store action re-home an orphaned card session to `main`; hydration-on-open landed with Theme F already. Switching boards without killing a session, true by construction, now has the test it lacked: `board-view.test.tsx` seeds a real kanban session in the store and asserts it survives an unmount/remount and is untouched by a *different* board's mount. **Still genuinely partial**: quit-and-relaunch against a packaged build needs a human on real hardware.
- ◐ **I** — Verification, scoped to what C/D/F actually built: `applyOptimisticMove` + rollback, the glow-state function, the four surface regressions, `taskRef`'s IPC-boundary round trip (the zod-strip assertion, done at the schema level rather than a literal quit/relaunch — no packaged build here), and `e2e/kanban.spec.ts` covering drag + the running glow. `composeCardPrompt` and the `taskRef` reconciliation now have their own unit tests (Themes G/H, [PR #47](https://github.com/bilo-io/midnite-studio/pull/47)) — not built by this theme, but no longer missing either.

### [Phase 40 — GitHub Projects](phases/phase-40-github-projects.md)

*Opens ProjectV2 — GraphQL-only, which is why `gh-graphql.ts` exists — as a read-and-nudge Projects
view: list the owner's boards, show one as a table with its custom fields, and write back exactly
two things. Creation, deletion and schema editing stay on github.com.*
**Refined x1 (2026-09-02), Themes B–G only — Theme A is in flight and was left untouched.**
39 → 53 items. The headline correction inverts a theme: the draft told an executor to follow
"Phase 20's optimistic update with rollback", but **Phase 20 established the opposite, in writing,
twice** — `onMutate` appears nowhere in the renderer, and `queries.ts` says *"None of them is
optimistic. A review that appears in the header before the forge accepted it would be the app lying
at exactly the moment trust matters."* Two more premises were false: `gh-cache.ts` **does not
exist** (the cited test covers a *terminal-state* cache a never-terminal board cannot use), and
three line refs had drifted.

- ✅ **A** — Shared contracts: `ForgeProject*` in its own `domain/forge-project.ts`, item content discriminated on `type` (`issue`/`pull`/`draft`), fields discriminated on `dataType` (text/number/date/single_select/iteration), channels + a `GitOpResult`-style bridge envelope carrying insufficient-scope as data. 12 tests. (2026-09-02)
- ✅ **B** — ProjectV2 reads: the `gh api graphql` transport with its `-f`/`-F` rule and exit-code-not-payload judgement, a 1 000-item ceiling whose truncation is **rendered**, owner resolution via `repositoryOwner` inline fragments (the reference's `viewer` roots answer a different question, and its org half fails **silently** without `read:org`), per-element `safeParse` because `fieldValues.nodes` is heterogeneous and most nodes arrive `{}`, and **no caching in main** — react-query owns staleness. (PR #38)
- ✅ **C** — IPC + query layer: keys that invalidate one board rather than the whole forge, `enabled`-gating because every forge read is a subprocess plus rate-limit spend, and the existing url-safe-base64 node-id validator reused verbatim for all four id fields — plus the same charset bound added to `cursor`, which the doc's own field list had missed and this pass's own test caught. (PR #38)
- ✅ **D** — The Projects view: the **eight**-file `ViewId` checklist (the doc's `ui-store.ts:46,61` was stale by +5, `FORGE_GATED_VIEWS` by +3), the arm placed **after** the repo guard since Projects is repo-scoped, five named empty/error states, and a header slot left for Phase 41's `[ Table | Board ]` toggle. (PR #38)
- ✅ **E** — Field writes: `setItemFieldValue` and `addItemToProject` in `gh-project-write.ts`, sending a **JSON body on stdin** rather than `-f`/`-F` flags — its value is polymorphic by definition, which is exactly the case both flags are documented to get wrong. Not optimistic; gated at the surface on `forgeWritesEnabled`, per the reason already written down. `addItemToProject`'s Reviews/Issues entry points deliberately deferred. (PR #41)
- ✅ **F** — Wiring: "open Projects" is **free** once the ViewId exists (`createViewsSource` derives it), so only the per-board source is new; the settings page is four enforced edits across three files. **The "native menu item under the Tasks group" turned out not to exist** — no such group, and no sibling forge view has a menu item either — corrected in the phase doc rather than built as a one-off inconsistent with everything around it. (PR #41)
- ◐ **G** — Verification: the assertion that proves the parser rule (an unrecognised field type must not drop the item), the assertion that catches the `-f`-vs-JSON mistake, and a human pass against a **real org-owned and a real user-owned** board, since no fixture proves the live root field. Four Vitest suites landed alongside E/B; `e2e/projects.spec.ts` now covers the gated-fetch, not-optimistic edit, refused-write and missing-scope paths against the mock bridge (PR #45). Two human-only passes remain: screenshots, and a real board on a real repo.

### [Phase 39 — One rail, five chords and four loops](phases/phase-39-status-bar-shortcut-rail.md)

*The status bar's left zone becomes a shortcut rail that teaches its own chords: one
`StatusToggle` behind every button, the name shown only while a surface is open or hovered so
the chord is what you read the rest of the time, ⌘K and ⌘P relocated out of the title bar,
diagnostics moved out of the machine-vitals cluster into its own group, and four loop launchers
that open the FAB straight onto a tab. A is the primitive the rest register through; B makes
grouping and separators data rather than array position; C and D are the two relocations; E
builds the launchers and F gives them two visual channels — glow for running, ring for the open
tab; G is reduced motion and the numbers.*

- ✅ **A** — One toggle, one rule: a shared `StatusToggle` replaces three hand-rolled copies, with the density×active label decision extracted as a pure, tested function. (PR #7)
- ✅ **B** — The registry learns to group: `group` on `StatusSegment`, separators derived from group boundaries, `right-delimiter` retired, `browser-toggle`'s priority inversion fixed. Separator pruning reads the rendered DOM, not a `collapsible` flag — the registry cannot tell an empty `health` group from one offering an Enable prompt. (PR #7)
- ✅ **C** — ⌘K and ⌘P move out of the title bar into the rail, active off `palette-store`'s `isOpen`/`mode`. (PR #7)
- ✅ **D** — Diagnostics moves left into its own `health` group; its popover flips `align="end"` → `"start"`. (PR #7)
- ✅ **E** — Four launchers from `DEFAULT_LOOPS`, colours via a new renderer-side `loop-glow.ts`, click → `openFabTab`. At rest the strip collapses to one glyph. (PR #7)
- ✅ **F** — Two channels, not one: coloured glow + slow pulse = *running* (amber when waiting); a ring = *this tab is open*. Inverts the seed deliberately. Pulse gated on window focus rather than shipped unmeasured. (PR #7)
- ✅ **G** — Reduced motion asserted through the cascade — landed early (PR #7), because the self-review found the rule could not fire: `html[data-motion='reduced'] .loop-launcher` (0,2,1) loses to `.loop-launcher.is-running.is-pulsing` (0,3,0), and shell's `!important` duration was masking it. The remainder — the density×state screenshot matrix (`shortcut-rail-shots.spec.ts`), the `collapsed` end-to-end assertion, `app:perf` (1132.1 KB, in budget) and blurred idle CPU (15.83% of one core) — landed in PR #33. The four loop launchers this theme originally described moved to the title bar's agent cluster in PR #21; their own state matrix lives in `fab-loops-shots.spec.ts`/`titlebar-agents.spec.ts`. Two human-only passes remain open at the phase's `## Verification` level, not lettered to any theme: a full keyboard pass and a human eye-pass at `full` density on a wide window. (PR #33)
### [Phase 38 — Paying off the e2e suite](phases/phase-38-e2e-suite-repair.md)

*45 of 442 Playwright specs were failing when the suite finally got a CI job, across 17 of 58
files — drift, not a regression: the bisect puts it before Phase 36. CI blocks on the 41 green
files via a `KNOWN_RED` ratchet; these themes empty the list. A and B are the two big shared
root causes (one pty-delivery fault behind seven specs; one panel fault behind twelve); C–G
are the independent stragglers; H deletes the scaffolding.*

- ✅ **A** — The pty seam: not a mock-bridge fault — `TerminalView`'s Phase 36 Theme C lazy chunk means `pty.create` lands a moment after Start, not in the same tick. `emitActivity`/`exitPty`/`printUrl` now poll for it structurally. Surfaced 4 unrelated Linux-GPU-runner specs, tagged `@linux-red` and handed to Theme I. (PR #12)
- ✅ **B** — The changes panel: not the doc's two guesses — the collapsed nav rail's hover-expand reflow moved "Changes" out from under Playwright's `.click()`, fixed at the spec level; a real Phase-26 `DiffCell` gutter-count regression fixed in product code. (2026-09-02)
- ✅ **C** — The workbench and the rail: 3 real product bugs found — `use-focus-trap.ts` stealing focus from `ConfirmDialog`'s Cancel, a `min-w-0` flex-shrink overflow, an inline-block textarea sizing gap — plus stale/brittle-selector fixes for the rest. (2026-09-02)
- ✅ **D** — The terminal panel ([PR #47](https://github.com/bilo-io/midnite-studio/pull/47) + Theme I): reload rehydration + independent list resize — both genuine spec races (an async chunk-load beat, and a bounding box measured mid-tween), fixed and stable over 3 local runs each. **Attempted and reverted, then resolved**: dropping the whole file from `KNOWN_RED` — green at 38/38 on macOS, then CI surfaced real failures in *other* specs — turned out to be Theme I's `navigator.platform` chord-mismatch wall, not a GPU one; its fix closed those too.
- ✅ **E** — Settings, files and tests: the same accessible-name substring collision hit three control pairs ("System"/"System Health", "Update"/"App Updates", an unscoped "Agent" match) — renamed the labels, not the selectors. (2026-09-02)
- ✅ **F** — The forge surfaces: found the nav-rail hover/click-reflow hazard a second time, plus a real regression — "Load the full log" silently truncated to "Load full log" by an unrelated PR. (2026-09-02)
- ◐ **G** — Monitor, graph and the browser pane, partial: `footer-monitor.spec.ts` and
  `browser-pane.spec.ts` are real, both confirmed on an actual CI run. `footer-monitor`'s cadence
  marker was a real product bug (`MonitorCluster` and `BatterySegment` each independently
  subscribing to the metrics stream, double-pushing every sample and corrupting
  `cadenceBreaks`'s zero-gap detection — fixed by sharing one subscription, ref-counted) plus a
  test-scoping bug (an unscoped `svg path` locator counting a metric icon's own paths alongside
  the chart's). `graph-themes.spec.ts`'s two cascade-replay specs looked fixed in an isolated
  local run (24/24) but a real CI run proved them still red — a genuine "local pass lies" trap,
  not yet root-caused; stays in `KNOWN_RED`. (2026-09-02)
- ✅ **I** ([PR #127](https://github.com/bilo-io/midnite-studio/pull/127)) — The terminal does not render on the CI runner. The original diagnosis —
  `@xterm/addon-webgl` getting no GPU context — was **wrong**: a DOM-renderer-under-test fallback
  was tried first, degraded gracefully on macOS, but on the real CI run it caused several terminal
  specs to **time out** and one shard to hit the 20-minute job cap and get cancelled, which is what
  forced a proper investigation. The real cause: `navigator.platform` reads `'Linux'` on the CI
  runner's actual Chromium (the packaged app ships macOS-only, so this never happens for a real
  user), and on a non-mac platform `chordFromEvent` treats a bare Ctrl press as `Mod` — so
  `Control+\`` (every affected spec's own way of opening a terminal) resolves to `Mod+\``, which
  never matches the `terminal.toggle` binding's literal `Ctrl+\``. The terminal panel never opened
  at all; xterm's own rendering was never reached, on any of these specs, ever. Fixed once, for
  every spec, by pinning `navigator.platform` in `mock-bridge.ts`'s `installMockBridge` — reproduced
  locally by pinning the OTHER way first (simulating Linux) and confirming the panel genuinely
  fails to open without the fix. Closes `phase-21-roster.spec.ts`, `terminal-lazy-preload.spec.ts`,
  `terminal-reveal.spec.ts`, `terminal.spec.ts` (including its PR #47 "new sighting", the same
  wall) and the `@linux-red` tag on six specs across `fab-loops.spec.ts`, `terminal-links.spec.ts`,
  `reviews.spec.ts` and `palette.spec.ts`. **Closed out (2026-09-04):** `shortcut-rail.spec.ts`/
  `status-bar.spec.ts` carried an unrelated Linux font-metric density bug — a stamp-`data-density`-
  and-read-`scrollWidth` measurement (the fix that worked for `titlebar-agents.spec.ts`) does NOT
  generalise here, since this bar's `grid-cols-[1fr_auto_1fr]` tracks stretch to fill a wide
  viewport, so `scrollWidth` reads back `clientWidth` rather than real content demand. Fixed
  instead by walking the viewport down in a 20px stride and asserting each band the instant the
  bar first reports it. `titlebar-agents.spec.ts` needed no fix — it carries zero `@linux-red`
  tags in the actual source, the doc's own note was stale. `panel-snap.spec.ts`'s one tagged spec
  was the same chord-mismatch wall this theme's platform pin already closed elsewhere. `grepInvert`
  stays as the mechanism, but zero specs carry `@linux-red` as of this batch — `KNOWN_RED` now
  holds only `graph-themes.spec.ts` (Theme G).
- ◻ **H** — Retire the ratchet: full suite green twice, then delete `playwright.ci.config.ts`, the `app:e2e-ci` task, and point CI back at `app:e2e`. Blocked on Theme G — its own precondition is `KNOWN_RED` empty.

### [Phase 37 — A glow that knows which tab](phases/phase-37-fab-tab-glow.md)

*The FAB panel's rainbow border grows an inner glow — soft, pulsating, hugging the inside edge
and fading smoothly to nothing before the centre — and that glow subtracts the half of the
spectrum furthest from the active tab, so the edge reads as "the green one" without ceasing to
be a gradient. A tokenises the ramp the other five copies share; B builds the masked conic
overlay; C makes it tab-reactive and sweeps between tabs; D keeps the collapsed FAB in the same
colour; E ties pulse cadence to loop state; F handles reduced motion and proves the lot.*

- ✅ **A** — One rainbow, six tokens: lift the 7-stop ramp out of its five verbatim copies in `styles.css` into `--rainbow-0…5`, with zero rendered change. (PR #8)
- ✅ **B** — The inner glow: `::before` overlay, blurred conic, three-stop radial alpha mask, pulse on mask-stop + opacity (never on `blur()`). (PR #8)
- ✅ **C** — The spectrum knows the tab: `data-fab-tab` + a four-row 180° arc table (one continuous, never-wrapping number line, not each tab normalised into `[0deg, 360deg)`); border and glow share one arc pair; 0.5s sweep via `@property`-registered angles. (PR #8)
- ✅ **D** — Collapsed FAB continuity: `.loop-run-glow.on-primary` takes the same arc, so collapsing the panel doesn't change its colour. (PR #8)
- ✅ **E** — Pulse follows the loop: cadence keys off `useAllLoopStatuses`; amber-waiting overrides the arc, as `.is-waiting` already does on the button. (PR #8)
- ◐ **F** — Reduced motion, and proof: `animation-name: none !important` (not a pause), computed-custom-property assertions, per-tab shots. A window focus/blur gate on the glow shipped unconditionally rather than after a blurred idle-CPU number — this sandbox couldn't produce a trustworthy one — and the panel's min/max-width resize stays untested. (PR #8, human pass outstanding)

### [Phase 36 — Faster, lighter, same app](phases/phase-36-performance-diet.md)

*Measure, fix what the numbers indict, leave budgets behind — with strictly zero user-visible
change. Refined x1 to assertion depth: every open decision resolved, packaged-equivalent
median-of-5 methodology pinned, and two pre-refinement errors corrected (the rebase poll was
dead code; the activity tick gates on tracked ptys, not blur). A is the harness every other
theme's numbers come from; B/C attack startup; D unifies icons; E/F are idle-CPU and memory;
G runs the profile-gated deferrals to an honest verdict; H locks in strict-ms budgets.*

- ✅ **A** — Baseline & harness: `MSTUDIO_PERF` boot marks via `perf-marks.ts` +
  `mstudio:perf:mark` IPC, `scripts/perf/` reports (startup, bundle, idle-CPU), Vite manifest,
  and the baseline table filled from real medians — which corrected two of the phase's own
  claims. (2026-09-01, local — no PR/no remote)
- ✅ **B** — Main-process startup: the sync login-shell probe (a median 284ms of blocked main
  thread) is async and off the boot path; the three `whenReady` chains run under one
  `Promise.allSettled` with migration first and `repos-restored` before `create-window`,
  machine-checked; main/preload/broker minified with `keepNames`. **when-ready 322 → 190ms,
  ready-to-show 683 → 570ms.** The three handler-module deferrals were *acquitted* — a new
  `modules-loaded` mark shows the noise on identical code is wider than the 10ms threshold.
  (2026-09-01, local — no PR/no remote)
- ✅ **C** — Renderer bundle: one Suspense + `DelayedFallback` (null ≤120ms → Spinner) *outside*
  the keyed view div, thirteen lazy views (Graph, EmptyWorkspace, Placeholder, ScreensaverHost and
  BrowserPane eager), xterm split behind one shared module + idle-preload, `CommitMessage` split
  to get the markdown pipeline out, env-gated sourcemaps. **Entry chunk 2 481.3 → 1 109.4 KB
  (−55%).** `@dnd-kit` *acquitted* at 59.9 KB behind four eager hook paths; `manualChunks` skipped
  (no vendor duplication). (2026-09-01, local — no PR/no remote)
- ✅ **D** — One icon family: 54 `lucide-react` files → `react-icons/lu` by direct rename,
  `strokeWidth` parity proved at code level, dep removed, eslint guard, convention files
  updated. −17.8 KB entry chunk; the claimed 40 MB footprint win does not exist (`@bilo-io/ui`
  keeps lucide-react). Landed 2026-09-01; human-eye screenshot pass still open.
- ✅ **E** — Idle-CPU zero: shared `useNow()` clock (1 interval, visibility-gated), dead
  `use-rebase-status.ts` deleted, auto-fetch pause+catch-up, event-driven screensaver arm,
  activity tick runs only while ptys are tracked. Blurred idle 0.38% → 0.12% of a core; rAF
  throttling verified rather than re-gated. Landed 2026-09-01 — and it surfaced an episodic
  88%-of-a-core animation in a FOCUSED idle window that belongs to G.
- ✅ **F** — Memory caps: 10k true-LRU + per-key notify in `line-highlight.ts`,
  scrollback-ownership audit with bounds tests, unbounded-Map sweep table in the phase doc.
  Landed 2026-09-01; the heap/1-hour-RSS numbers stay ◐ PARTIAL (DevTools-only).
- ◐ **G** — Profile-gated claims, taken to numbers. **Broker: INDICTED** — 96.8% of a core for
  7.6 MB/s under `yes`, half of it `appendScrollback` copying the whole retained buffer per chunk;
  16ms per-pty coalescing took it to **1.16% of a core per MB/s, 11× less CPU per byte**, RSS
  227 → 168 MB. **`ps` probe: INDICTED** at 4.08% of a core; `QUIET_MS` 750 → 1500 halves it.
  **Two gates open for a human:** graph edge culling (needs a DevTools frame-time capture; the
  50k-commit fixture generator landed) and an episodic renderer-32%/GPU-55% animation in a
  *focused* idle window that Theme E's measurement turned up. (2026-09-01, local)
- ✅ **H** — Perf budgets: `moon run app:perf` (playwright.perf.config, outside the default gate,
  `retries: 0`), one budget source in `budgets.json` — 2.5× median for milliseconds, 1.13× for
  bytes, because a byte count does not flake and 2.5× would have permitted undoing the phase.
  Entry-chunk **absence** assertions are the real legacy; startup budget launches through
  `scripts/perf/electron-run.mjs`, not `_electron.launch`, so it asserts the same number the
  report prints. **8 passed.** (2026-09-01, local — no PR/no remote)

### [Phase 35 — FAB Mission Control](phases/phase-35-fab-mission-control.md)

*The FAB panel becomes a real loop console. Today every tab latches onto the same pre-existing
session (a stale-closure bug in `fab-terminal-view.tsx`) while its actual spawns pile into the
main terminal housing; this phase gives each tab its own in-panel session via a
`surface: 'main' | 'fab'` flag on `TerminalSessionSchema`, a per-loop checkbox composer, and
Start↔Stop with the gradient glow pulse. A is the shared contract (LoopDefinition, surface,
run-record schemas); B kills the triplicated prompt truth by unifying the FAB with
`DEFAULT_AGENT_SKILLS` into one Settings-editable registry; C is the session-hosting fix; D the
composer + Start/Stop/glow; E the mission-control layer (FAB dots, waiting-toasts, capped run
history à la `councils-runs-store`). Claude-only this phase; Stop = sleep, transcript kept.*

- ✅ **A** — Shared contracts: `LoopDefinition`/`LoopRunRecord` schemas, `composeLoopPrompt`,
  `surface` on `TerminalSessionSchema` (zod-optional, so old `terminals.json` parses),
  `mstudio:loop-runs:*` channels. (2026-09-01, local — no PR/no remote)
- ✅ **B** — Registry unification: `DEFAULT_LOOPS` retires the FAB's hard-coded prompts by naming
  an `agentCommandId` into `agentSkills` (wrapped, not migrated — one prompt store, loops as a
  view over it); Settings ▸ Agent ▸ Loops edits modifier defaults. (2026-09-01)
- ✅ **C** — Session hosting: `surface: 'fab'` sessions filtered out of the main
  housing/session-list, `startAgent` returns the session (stale-closure bug gone by construction),
  lazy create-on-Start, `TerminalView` `layoutClassName` prop, asleep rehydration into tabs.
  (2026-09-01)
- ✅ **D** — Composer + Start/Stop: modifier checkboxes + extras field collapsing to a chip strip,
  prompt composition on Start, Stop = interrupt-then-sleep with the transcript kept,
  `.loop-run-glow` in three states keyed to agent activity, each with a reduced-motion opt-out.
  (2026-09-01)
- ✅ **E** — Mission control: FAB glow + per-loop dots (amber on waiting), an actionable waiting
  notice, `loop-runs-store.ts` capped history whose ENDS are owned by main (finalised off the
  pty's own exit) + per-tab history list, `fab-loops.spec.ts`. (2026-09-01)

### [Phase 34 — Agent Councils](phases/phase-34-agent-councils.md)

*A standing panel of AI members answers one prompt in parallel, then a synthesizer distills the
results — ported from `~/Dev/midnite`'s mature councils feature as a narrow MVP slice: one format,
global scope, a 3-agent member pool, and an explicit auto-send exception justified by members never
touching a repo. A is the contract every other theme reads off; B–D are persistence/orchestration/
IPC; E–G are the three UI surfaces; H is reliability (retry/skip).*

- ✅ **A** — Shared contracts: `Council`/`CouncilMember`/`CouncilRun` schemas, one-format literal,
  starter members, IPC channel constants. (2026-09-01, local — no PR/no remote)
- ✅ **B** — Persistence: a global `councils-store.ts` + run history (`councils-runs-store.ts`,
  capped at 200 runs), following `agents-store.ts`'s merge-tolerant shape. (2026-09-01)
- ✅ **C** — Run orchestration: parallel one-shot member spawns via `pty-service.ts` directly (not
  through `terminal-store`), a per-run mutation lock (`withRunLock`) serializing the settle barrier,
  the auto-send exception, synthesis. Two real bugs found and fixed while testing: a race where two
  members settling back to back could clobber each other's write, and a missing shell `exit` — the
  pty is a login shell, not `pty.spawn(command)`, so without `; exit $?` the CLI finishing never
  actually ends the pty and the settle barrier's exit signal would never fire. (2026-09-01)
- ✅ **D** — IPC bridge: preload methods + main handlers + renderer hooks (`use-council.ts`,
  `use-council-run.ts`). (2026-09-01)
- ✅ **E** — UI — list & create: fills the `WORK_IN_PROGRESS` councils stub with a real list/create
  flow. (2026-09-01)
- ✅ **F** — UI — detail & members panel: flat add/remove/edit, synthesizer picker, topic composer
  with the auto-send note. (2026-09-01)
- ✅ **G** — UI — run view: per-member tabs (a plain live-text view over the same `pty.onData`
  stream `TerminalView` uses, not a full xterm embed — members are output-only, one-shot, no input),
  synthesis tab, run-thread rail. (2026-09-01)
- ✅ **H** — Retry/skip controls for a hung or failed member. (2026-09-01)

Landed to local `main` — this repo has no git remote, so no PR link. Two manual passes remain for a
human: a real end-to-end run against real `agy`/`codex`/`opencode` installs, and a copy review of
the auto-send note.

### [Phase 33 — Application Installation, CLI Tool & Desktop Integration](phases/phase-33-installable-app-and-cli-integration.md)

*Production-grade macOS DMG installer, a `midnite-studio` CLI binary symlinking into PATH with shell
completions, custom `midnite-studio://` protocol handling, a background auto-updater service, and
first-run setup onboarding. Written throughout against the **Midnite Studio rename**, which is a hard
prerequisite: every identifier this phase creates is a name. Sequencing is C → B (the CLI is a thin
wrapper over the protocol), with A and D independent and E last.*

- ✅ **A** — Polished DMG Package & macOS Desktop Integration. `dmg:` window layout + @1x/@2x PNG artwork, hardened-runtime entitlements, `protocols:` registration, an env-gated `afterSign` notarize hook, and a `verify-dist` gate asserting `codesign --verify` / `hdiutil verify`. (2026-08-30)
- ✅ **B** — `midnite-studio` CLI Binary & System PATH Symlinking. A POSIX `sh` wrapper execing `open` on the URL scheme, `mstudio:cli:*` channels behind `GitOpResultOf`, a `/usr/local/bin` → `~/.local/bin` fallback that never uses sudo, zsh/bash/fish completions, and the CLI Integration settings page. (2026-08-30)
- ✅ **C** — `midnite-studio://` Custom Protocol Handler & Deep-Link Dispatch. The single-instance lock already exists — this adds `open-url`, argv forwarding, a pure `parseDeepLink` that returns `null` on hostile input, and a jail rule: a known repo opens silently, any other path needs consent. (2026-08-30)
- ✅ **D** — Auto-Updater Service & Update Status Banner. `electron-updater` behind one coalesced `UpdateState` push, a `manualInstall` flag so an ad-hoc-signed build still detects updates, `feedChannelFor` mapping stable → `latest`, a `publish:` block, and a status-bar pill that is `toast-store`'s first caller. (2026-08-30)
- ✅ **E** — First-Run Onboarding & System Health. `onboardedAt` seeded by the shared `version < 5` migration, a focus-trapped first-run modal, and one `HealthChecklist` shared by the modal and a System Health settings page. (2026-08-30)

### [Phase 32 — The browser gets an engine, and the tabs to fill it](phases/phase-32-browser-engine-and-tabs.md)

*Phase 27 Theme F shipped a browser with no browser in it — chrome drawn disabled over a "No web
engine yet" plate — and attached a condition to the engine: embedding remote content is a
sandboxing, permissions and navigation-policy surface with a security review of its own. This phase
fills the body and pays that condition. A `WebContentsView` per tab on its own persistent partition
with no preload, tabs and groups modelled on the workbench strip, a React new-tab page carrying the
Midnite mark and Google/YouTube/Figma tiles, and the occlusion choreography a native layer painting
above the DOM demands.*

- ✅ **A** — `WebContentsView` host in main, the `mstudio:browser:*` channel contract, per-tab lifecycle. (2026-08-30)
- ✅ **B** — Permissions denied, navigation policy, no preload on embedded views, clear browsing data. (2026-08-30)
- ✅ **C** — Tab store and strip: drag-reorder, context menu, browser-scoped chords. (2026-08-30)
- ✅ **D** — Tab groups, manual (named, coloured, collapsible) and repo-derived. (2026-08-30)
- ✅ **E** — Occlusion registry and bounds choreography — every overlay must outrank the native layer. (2026-08-30)
- ✅ **F** — The new-tab page: `BrandMark` hero, shortcut tiles, repo-derived tiles, recents. (2026-08-30)
- ✅ **G** — Real chrome: back/forward/reload, URL-vs-search resolution, find-in-page, zoom, errors. (2026-08-30)
- ✅ **H** — Dev powers: detached DevTools, dev-server detection, responsive width presets. (2026-08-30)
- ✅ **I** — Forge in place: links open in-app by default, `originRepoId` routing, preview deploys. (2026-08-30)

### [Phase 31 — Interactive Rebase Builder & Graph Sequence Editor](phases/phase-31-interactive-rebase.md)

*Visual drag-and-drop rebase sequence planner (pick, reword, squash, drop, fixup) backed by a custom GIT_SEQUENCE_EDITOR helper binary.*

- ✅ **A** — `GIT_SEQUENCE_EDITOR` helper script, IPC channel schemas, and `git-engine` rebase commands.
- ✅ **B** — Interactive Rebase Sequence Editor Overlay modal, commit drag-reorder, and action pickers.
- ✅ **C** — Rebase state controller, paused status banner, and Changes view conflict integration.
- ✅ **D** — Safety net backup ref creation (`refs/midnite-backup/`), blast-radius modal, and one-click restore.

### [Phase 30 — A terminal that survives you](phases/phase-30-terminal-hardening.md)

*Phase 15 made the terminal's transcript durable and its process deliberately mortal — `before-quit`
kills every pty, a reload orphans them, and rows come back dimmed with a "press Enter for a new
shell" line. This phase overturns that: a detached session broker (spawned under the app's own
Electron binary as Node, so node-pty keeps its single ABI) owns the ptys and their ring buffers, the
renderer rebinds to live sessions after a reload or relaunch, and the same `$SHELL -l` runs
untouched — no tmux, no `ZDOTDIR` shim, no `TERM` change. Three reported defects ride along: the
blank pane on reveal, the `BAAAA` auto-names from keystroke reconstruction, and the ambiguous dimmed
row, which becomes an honest live/asleep/ended state with an agent-resume button. Every collapsible
panel gets the same 200 ms ease-in-out size tween through one primitive, fitting the terminal once at
the end. Refined x2 adds a fourth defect and the two themes that fix it: the agent activity glyph
never spins, because both gates read the creation-time `session.kind` while the `ps` probe has been
reporting the truth through `liveAgentId` all along — and beneath that, an idle caret rendered at
`opacity: 0` under reduced motion, an `undefined` state drawn as a confident idle, and detection that
stops the moment the panel is collapsed.*

- ✅ **A** — the blank pane and panels that interpolate: a failing `terminal-reveal.spec.ts` first (the
  mock learns to record `resizes`/`snapshots`), then a live-session `pty:snapshot` on remount behind a
  `replay-gate` and `fit`+`refresh` off a `settleCount` prop; `useRevealSize({open, size, axis, dragging})`
  tweens terminal closed↔height↔maximized, the session list and the repos aside, the browser pane keeps
  its opacity `useReveal`, all off `motionMs()` (0 ms under `data-motion='reduced'`). Found in review:
  the transition was armed whenever not dragging rather than gated on `settled`, which would have
  re-armed the CSS transition on every native window-resize tick while maximized — fixed with a
  `settled` gate and an `animateKey` escape hatch (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **B** — reattach after a renderer reload: `live: {ptyId, pid, cols, rows} | null` on `terminal:list`,
  `hydrate` binds `'open'` instead of `'exited'`, a `mstudio:pty:snapshot` invoke, `render-process-gone`
  logs and reloads (no `did-finish-load` — the `webContents` survives a reload). A minimal `log.ts`
  seam lands ahead of Theme C's broker client, which will redirect it. The dev-only HMR manual check
  stays open (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **C** — the session broker: a third esbuild output run under `ELECTRON_RUN_AS_NODE`, asar-unpacked
  beside a whole-unpacked node-pty; `[u8 type][u32 len]` frames over `<userData>/broker/<v>[-dev].sock`
  (0600) with `hello`/`list`/`attach`/`kill` frozen so version skew stays readable; `env` in every
  `create`; 2 s/5 s timeouts then fail-soft (`MSTUDIO_PTY_INPROC=1`); `before-quit` and
  `window-all-closed` detach; a 4 s *Reattached N sessions* segment
  (landed 2026-08-28, feature/p30-c).
- ✅ **D** — honest session states: `sessionPhase()` over a persisted `asleep` flag × `ConnectionState`,
  an `EndedStrip` (`role="status"`, *exit N* from a new `exitCodes` map) with *Start new shell here* and
  *Resume conversation* (roster `resume: string[]`), Sleep in the row menu (lucide `Moon`), the **row**
  `X` confirming when a foreground command runs, `DotState` gains `'asleep'` (landed 2026-08-28, feature/p30-d).
- ✅ **E** — naming from the process tree: delete `trackShellCommand`; `ps` gains `stat=` (four columns,
  fixtures hand-edited), `foregroundOf` picks the last `+` member by pid, `commandLabel` truncates at
  40, `pty:command-changed` holds the name after exit, OSC title only before any command
  (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **F** — the indicator that never span: the activity gate moves off the creation-time
  `session.kind` onto `resolveSessionAgentId`, so an agent started by typing its name in a shell
  finally spins; `SessionActivity` gains `'idle'` and `undefined` becomes a fourth, visibly-unsure
  glyph; one `animation-name: none` rule scoped to `[data-activity]` stops the shell's reduced-motion
  reset pinning `caret-blink` to its `opacity: 0` final frame; `ThinkingSpinner` is deleted in favour
  of `skeleton.tsx`'s byte-identical `Spinner`. Labelled, never announced. Renderer-only, after D
  (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **G** — a detector that can be wrong out loud: detection moves to `pty-service.ts`'s single
  `ptyData` send (a collapsed panel unmounts every `TerminalView`, which is exactly when the status
  bar's count is the only thing looking) behind a new `mstudio:pty:activity` event; markers become
  `AgentDefinitionSchema.activity` roster data behind a compile-checked `RegexSource` and a 2 ms
  per-chunk budget; a guess decays `thinking`→10 s→`waiting`→60 s→`idle`; and it says so when it
  breaks, through `log.ts` and an **Agent activity** readout on the Terminal settings page.
  Independent of C (landed 2026-08-28, merged locally — no PR/no remote). **Phase 30 is now
  feature-complete — all seven themes (A–G) have landed; only the "Open, for a human" manual
  passes remain.**

### [Phase 29 — Markdown slides, everywhere markdown already renders](phases/phase-29-markdown-slides-viewer.md)

*Files preview, PR/Review descriptions and comment threads all render markdown today through the same
`react-markdown` + `remark-gfm` pipeline, and none of them offers more than a scrolling `.prose` block.
This phase ports midnite's markdown-to-slides deck — headings-only pagination, typewriter/step reveal,
a full keyboard set — as a fullscreen `z-dialog` viewer wired into all three, plus an unbound `COMMANDS`
entry for Phase 23's palette to pick up later. No IPC channel, no zod schema, no deck authoring or
persistence — this is a read-only view over markdown a surface already has.*

- ✅ **A** — the deck engine: `deck-parser.ts` walks a real mdast tree (`remark-parse` + `remark-gfm`)
  rather than a hand-rolled line tokenizer — h1 is a cover slide, every heading after it starts a new
  slide, a list contributes one step per item (matching the crib), and each step keeps its own source
  substring so it renders as a real `react-markdown` fragment rather than midnite's hand-rolled
  `dangerouslySetInnerHTML` (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **B** — the deck presenter: typewriter title + step-by-step bullet reveal, the full keyboard set
  (arrows/space/Home/End/`?`/Escape) via a bubble-phase listener reading a "latest values" ref, a
  slide-position rail, a help overlay, shiki for code fences. Two bugs found chasing a flaky e2e spec:
  the title typewriter's `done` defaulted `true` before its first effect ran, and the nav reducer
  forced `instant` on every reveal (not just an actual slide change), each retriggering an
  already-finished typewriter (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **C** — the fullscreen host: a `slides-store.ts` (`deck`, `activeMarkdown`) and a `z-dialog`
  `slides-modal.tsx` mounted once from `app.tsx`, reusing the existing `use-focus-trap.ts` rather than
  a fourth hand-rolled trap (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **D** — wired into every markdown surface: a "Present" button on Files preview, PR/Review
  descriptions and comment threads; only the two description-level surfaces claim `activeMarkdown`
  for keyboard invocation (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **E** — a `markdown.presentAsSlides` `CommandId` in `COMMANDS`, unbound, grouped under `'view'`,
  with a `useCommandHandlers()` arm following the existing reactive `{enabled, disabledReason}`
  shape (landed 2026-08-28, merged locally — no PR/no remote). Phase 29 is now feature-complete —
  all five themes (A–E) have landed.

### [Phase 28 — Worktrees first, and the section tree that can say so](phases/phase-28-sidebar-section-tree.md)

*`view-sections.ts` exports `ALL_SECTIONS` under the comment "Every section, in the order the tree
renders them" — a sentence that has not been true since Phase 17 wrote it. The order it declares matches
the order the sidebar renders by coincidence, because `RepoTree` renders four literal `<TreeSection>`
blocks in source order and the constant that claims to own the order drives nothing. This phase makes the
claim true: the order becomes data, `RepoTree` renders from it, and the first thing that data says is that
Worktrees comes first. The nesting arrives with it — and resolves rather than contradicts the comment at
`repos-panel.tsx:800` that argues "'Local', not 'Branches'", since that objection is about a rename and a
parent owning two labelled children is not one. No git command, no IPC channel, no zod schema; `shared`
and `git-engine` are untouched. Its value is that the next phase to add a section registers one instead of
hand-editing six files — which is exactly what Phase 22 Theme B is currently written to do.*

- ✅ **A** — `SECTION_TREE` as the single ordered declaration (`worktrees`, `branches → [local,
  remotes]`, `tags`, `stashes`, `forge → [actions, reviews, issues, tests]`); `ALL_SECTIONS` derived by
  flattening rather than hand-written; `VIEW_FILTERS` learns to name a parent and mean its subtree; a
  parent is visible only when at least one child is (landed 2026-08-28, merged locally — no PR/no
  remote).
- ✅ **B** — the indent ladder gets a fifth rung: `TREE_INDENT` gains `pl-17` and `TreeSection.depth`
  widens to `0|1|2|3`, because nesting Remotes pushes its `origin` groups to depth 4. Found and fixed
  along the way: `pl-17` is not a Tailwind default-scale utility and silently generated no CSS until
  `tailwind.config.ts` gained `spacing: { 17: '4.25rem' }` (landed 2026-08-28, merged locally).
- ✅ **C** — `RepoTree` renders from the tree: one `renderSection` walk plus a `SECTION_BODY` map
  replaces the four literal blocks, so a section the declaration does not contain cannot be rendered.
  Worktrees lands first and is otherwise byte-identical (landed 2026-08-28, merged locally).
- ✅ **D** — folds survive: `collapsedRepoSections` joins the ui-store beside `collapsedNavSections` and
  `collapsedSettingsGroups`, per repo, `version: 2 → 3` with a migrate, `RemoteGroup`'s bare `useState`
  folded in, and pruning on repo close — via a new `use-prune-closed-repos.ts` mounted from `Shell`,
  not `repo-lifecycle.ts` (which has nothing to do with a repo leaving) (landed 2026-08-28, merged
  locally — no PR/no remote).
- ✅ **E** — the Branches heading earns itself: a combined count (a pure, unit-tested
  `branchesCount()`) and a `parentSectionMenu` beside (not widening) `sectionMenu`, since
  `RefSectionKey` stays narrow and a parent has no refs — New branch…/Fetch all/Prune
  remote-tracking refs, the latter two both the same `fetch` call since pruning is already
  every fetch's default. Forge's own count landed via Theme F below (landed 2026-08-28, merged
  locally — no PR/no remote).
- ✅ **F** — Actions/Reviews/Issues/Tests stopped being one opaque `ForgeSections` blob and became four
  independent `SECTION_BODY` leaves, rendered by the generic recursive walk; `Forge` hides entirely
  with no GitHub remote via one `hasGithubForge` check in `RepoTree`, gating the whole subtree
  (Tests included — a deliberate behaviour change) before the walk reaches it, rather than a
  per-child check. Gives Forge a count of its visible child sections, 0–4 (landed 2026-08-28,
  merged locally — no PR/no remote).
- ✅ **G** — Settings ▸ Sidebar catches up: a new `summarizeSections()` pure helper collapses a fully
  admitted parent's children to the parent's own name in `describeNarrowed`; `SECTION_LABELS` was
  already complete from Theme A (landed 2026-08-28, merged locally — no PR/no remote).
- ✅ **H** — reconciliation: `view-sections.ts` gained a module-level doc covering the tree, the
  parent-visibility rule and why `RefSectionKey` stayed narrow, plus an "adding a section" note; the
  `"'Local', not 'Branches'"` comment and the Phase 22 Theme B coordination line were confirmed
  already correct from an earlier theme (landed 2026-08-28, merged locally — no PR/no remote). Phase
  28 is now feature-complete; open: a screenshot baseline for the sidebar tree (never stood up in any
  theme of this phase) and two "Open, for a human" manual passes needing a real, large repository.

### [Phase 27 — The footer becomes a status bar, and the browser it makes room for](phases/phase-27-status-bar-and-browser-panel.md)

*The footer has been a 24px strip since Phase 9 and has never spanned the app: it is mounted as the last
child of the content column (`app.tsx:773`), so it begins at the repositories panel's right edge. Moving
it one level up into `CONTENT_BOX` is Theme A and is ten lines — and the refinement writes down *why*
`stackHeight` survives it (the column grows 24px, the row shrinks 24px, they cancel) rather than leaving
it to be re-derived. The phase exists for what the width is then for — `FooterCluster`'s own comment
already predicted two of the three segments that would arrive and asked for slots rather than a fixed
list, so C–E make the informal slot real. F cashes a promise the keymap made in Phase 9: `Mod+b` has been
reserved for a browser since then and currently opens a "coming soon" dialog. No git command, no IPC
channel, no zod schema — but the refinement found the op-progress source named the wrong file: every git
write funnels through ONE `useMutation` in `useTargetedGitOp` (`use-status.ts:262`), not through
`queries.ts`, so D threads a required `opId` through 31 call sites instead.*

- ✅ **A** — `<FooterBar />` moves out of the content column into `CONTENT_BOX`; `stackHeight` proved
  still correct with the cancellation argument written down, the two now-false geometry comments
  rewritten, plus the `data-testid` the bar has never had and the fix to `footer-monitor.spec.ts:222`,
  which asserted a branch name the footer stopped rendering (landed 2026-08-28)
- ✅ **B** — `features/status-bar/` at last: the file imports diagnostics, monitor and the ui-store and
  the only terminal thing in it is one button. `FooterBar` → `StatusBar`, no compat shim, and
  `chordFor`/`displayChord` come along as real exports — they are module-local today, not keymap ones
  (landed 2026-08-28)
- ✅ **C** — static composition, not a registration store: `{id, zone, priority, El}`, three zones as a
  `1fr_auto_1fr` grid so the centre cannot drift, and the rule that a segment with nothing to say
  renders nothing — mapped with no wrapper element, or `gap-3` leaves a hole per absent segment
  (landed 2026-08-28)
- ✅ **D** — five segments off state the app already has: active worktree, op progress from a threaded
  `opId` (ranked, with `+N` when two run, silent on failure), `inProgress` mid-operation (the one
  sanctioned exception to the title-bar duplication rule), the agent count — from `terminal-store`, not
  the `use-agents` roster the doc wrongly named — and the tests/checks verdicts, now with the
  aggregation rules they lacked: worst-of across suites, and the PR for the checked-out branch.
  Priority follows actionability rather than render position: the two verdicts and mid-operation
  outrank the toggles, diagnostics and the monitor at Theme E's future collapse time. Unblocks two of
  Theme G's three remaining items (landed 2026-08-28, merged locally — no PR/no remote)
- ✅ **E** — two-stage overflow measured from content rather than px breakpoints: labels → icons → a
  priority-ordered `…` popover, with an asymmetric 24px hysteresis band so dragging the repos splitter
  cannot flicker. The decision lives in a pure `densityFor()` — jsdom has no `ResizeObserver` and the
  repo has no vitest setup file, so the logic is extracted rather than the observer stubbed. `collapsed`
  is all-or-nothing per zone into one shared popover rather than a partial subset, and compact styling
  is one `.status-label` CSS class gated on the bar's own `data-density` rather than a prop every
  segment accepts. Two bugs found in review: a sticky collapse (re-measuring an already-collapsed DOM
  never recovers) and a default flex row that never actually overflows (landed 2026-08-28, merged
  locally — no PR/no remote)
- ✅ **F** — `browser.open` → `browser.toggle`, a native-menu item that did not exist,
  `browserOpen` persisted like `reposOpen` with no version bump — the store's custom `merge`
  already fills a missing key, which also meant fixing `PersistedUi`'s pre-existing drift — and
  a chrome stub with **no engine** sliding over the whole content row, leaving the bar visible,
  which is the phase's own demonstration (landed 2026-08-28)
- ✅ **G** — `use-focus-trap.ts` extracted from Popover and retrofitted onto the browser pane, button/keyboard-order audit, tooltips at compact density, aria-live regions, and all verification passes completed (landed 2026-08-30). Phase 27 is now 100% complete!
- ✅ **H** — pure-function absent-case tests for the four Theme D segments, `status-bar.spec.ts`'s
  left-edge and narrowing/overflow-popover specs, the `footer-monitor.spec.ts` shots gate, and a
  light+dark screenshot pass for the phase's new bar states — most of the rest (density/merge/
  partialize tests, the terminal-maximize guard) turned
  out already landed with the themes that needed them (2026-08-28).

### [Phase 25 — Search everywhere, and the blame that explains it](phases/phase-25-search-everywhere.md)

*A grep across all four packages for `blame`, `pickaxe`, `log -S` and `--follow` returns zero matches:
`buildLogArgs` takes `limit`, `all` and `revisions` and nothing else, and the graph's two "filters"
re-stream by ref or merely dim by author — neither can find what is not already on screen. A builds the
searches git has, B generalises `log-service.ts`'s single-active-stream into a registry whose supersede
policy is a table (`log: 'supersede'`, `search: 'concurrent'`) rather than a rule each caller re-states,
C–D are the surfaces, E extracts the text filter the repo has now written twice, F moves Fetch off
`Mod+Shift+f`. **Neither neighbour has landed**, so the standalone path is the primary reading of every
item: this phase writes `commands/grep.ts` whole and ships a substring Files mode, with two `⏳` palette
items excluded from the count and four one-line "if Phase 23/24 has landed" deltas. Refined x1: the
`CodePreview` rework that Themes C, D and E all silently assumed is now Theme D's first two items.*

- ✅ **A** — `commands/{search,grep,blame}.ts` + `parsers/{grep,blame}-parser.ts` all net-new;
  `buildLogArgs` widened to author/message/path/date/`-S`/`-G` with the append order that keeps the
  three-key call byte-identical; `--follow` throwing on two pathspecs; one `buildGrepArgs` emitting
  `-e <pattern>`, then `rev`, then `--`; the porcelain `previous` kept on the *line* because renames
  differ per hunk. (landed 2026-08-28)
- ✅ **B** — `stream-registry.ts` lifted out of `log-service.ts` with `POLICY` as a table and a
  `release` that stops the map growing; `search-service.ts` allowing four concurrent streams and
  **owning the 5000 cap**; `search*`/`blame*` channels whose batch is discriminated on `mode`; a zod
  refine refusing a leading `-` on every string that reaches argv. (landed 2026-08-28)
- ✅ **C** — a `'search'` rail view with Commits/Content/Files modes, the repo's first **measured**
  virtualizer over an append-only row array, a results/preview split, four named empty/loading/error
  states, a visible truncation row, and a footer readout while a stream is live. (landed 2026-08-28)
- ✅ **D** — `CodePreview` rewritten from one `codeToHtml` blob into per-line `data-line` rows from
  `codeToTokens()`, which is what C's scroll-to-line and E's find bar need; a blame gutter as a
  sibling grid column so alignment is structural; `-C -M`; reblame with an unpersisted per-file stack. (landed 2026-08-30)
- ✅ **E** — `components/filter-input.tsx` at last, retrofitted onto repos and reviews and given to the
  Changes view; a `Mod+f` find bar with case/regex toggles and wrapping navigation; a graph-header box
  that dims, counts "{n} of {loaded} loaded", steps, and hands off. (landed 2026-08-30)
- ✅ **F** — Fetch to `Mod+Shift+r` (lowercase, like every chord in the keymap), `search.open` on
  `Mod+Shift+f` and global-scoped, `NumberField` and `Toggle` added to `controls.tsx`, and a Search
  settings page. (landed 2026-08-30)

### [Phase 26 — Side by side, and the room to show it](phases/phase-26-side-by-side-diffs.md)

*Four phases have deferred side-by-side diff with the same two reasons — no full-width surface, and
don't fork the renderer — and both have quietly stopped being true: Phase 17's workbench gives
full-width tabs, and `diff-rows.ts` is a pure row builder a second arrangement can sit beside. The
engine needs no change at all: every `DiffLine` has carried both `oldNo` and `newNo` since Phase 12,
and `annotateIntraline` already stores each side's word-level ranges on its own line, so split
inherits word-diff for free. A is the row model, B makes "one renderer" structurally true, C is the
layout and the toggle, D pays the performance bill split creates, E–H are what a second column makes
newly possible. Only H touches a contract.*

- ✅ **A** — `toSplitRows`/`pairRun`/`canSplit` beside `toDiffRows`: positional pairing within
  balanced runs, deliberately the same rule as `pairLines`, so alignment and word-marks can never
  disagree. Combined, binary and zero-hunk diffs degrade to unified without asking (landed 2026-08-30, PR #1).
- ✅ **B** — `LineRow` becomes a shared `DiffCell` both layouts mount, with `gutter` as a prop rather
  than a store read. No user-visible change: the unified screenshots must come out byte-identical (landed 2026-08-30, PR #1).
- ✅ **C** — two columns through the existing virtualizer, one locked horizontal scroller (not two
  synchronised ones), and `diffLayout: 'unified' | 'split'` persisted in `ui-store` beside
  `diffShowOldGutter`, with a `ResizeObserver` fallback that never rewrites the preference (landed 2026-08-30, PR #1).
- ✅ **D** — `inline` mode gets a virtualizer for the first time; All-changes and Reviews Files render
  every row today, and split doubles the per-row DOM. Brings `EXPAND_ALL_LIMIT` back up for review (landed 2026-08-30, PR #1).
| [26 · Side by side, and the room to show it](phases/phase-26-side-by-side-diffs.md) | ✅ DONE | — | 68/68 | `██████████` | 100% | — | — |

- ✅ **E** — a `DiffToolbar` the accordion surfaces can mount, with actions a surface cannot perform
  omitted rather than dead — `PrFiles` has one `gh pr diff` in memory and cannot refetch at `-U` (landed 2026-08-30).
- ✅ **F** — LEFT-side comment anchoring: `leftSideLines`, a per-side `ThreadsByLine`, a `del` line
  made commentable, and threads still rendered as full-width rows with a LEFT/RIGHT badge (landed 2026-08-30).
- ✅ **G** — a `commit` arm on `WorkbenchTab` so the inspector has a full-width home; the 720px graph
  dock is untouched and stays the quick-look panel (landed 2026-08-30).
- ✅ **H** — `baseSha` on `ForgePullDetailSchema` from `gh pr view`'s `baseRefOid`, which is the only
  thing standing between the existing `ImageDiff` viewer and a pull request (landed 2026-08-30). Phase 26 is now feature-complete — all eight themes (A–H) have landed.

### [Phase 24 — The explorer learns to write, and to search](phases/phase-24-writable-explorer.md)

*Phase 16 shipped the Folder explorer read-only **by contract** — four doc comments assert that no
write channel exists — and this phase makes all four false deliberately, rewriting them in the same
voice. A is the contract, B is the jail (a create cannot be authorised today, because
`confineToRoot` returns `null` for a path that is not there yet), C–D are the affordances, E–G are
the three things Phase 16 named as later work. Repo scope only; `claude-home` is not a member of the
write scope, so `agent-page.tsx` stays read-only without knowing writes exist.*

- ✅ **A** — the write contract: four `mstudio:fs:*` write channels on the `GitOpResult` envelope, an
  `FsVersion` token on the read, and the four "there is deliberately no write channel" comments
  rewritten rather than left stale (landed 2026-08-28)
- ✅ **B** — the jail learns to write: `confineParent()`, symlink-final-segment refusal, a `.git/`
  refusal that is a gate rather than the cosmetic `isIgnored` hint, and a TOCTOU-safe write through
  a descriptor. `fs-scope-write.ts` sits beside `fs-scope.ts` the way `gh-write.ts` sits beside
  `gh-cli.ts` (landed 2026-08-28)
- ✅ **C** — mutations in the tree: the tree's first `onContextMenu` (plus a hover ellipsis, one
  shared `openMenu`), a `writable` opt-in prop, inline create/rename validated client-side before
  the round trip, and delete behind a confirm naming a directory's real file count/size (a new
  capped `mstudio:fs:dir-stats` walk) and how many are uncommitted (joined off Theme F's own status
  index). New read-only `mstudio:shell:show-item-in-folder` channel for Reveal. Found and fixed: the
  e2e mock's `listDir` handed out the live `fsDirs` array by reference, so react-query's structural
  sharing saw "unchanged" after a mutation and silently never repainted (landed 2026-08-28)
- ✅ **D** — the preview pane becomes an editor: CodeMirror 6 (the app's first editor dependency,
  hand-picked extensions rather than `basicSetup`, code-split behind `React.lazy`), dirty state, a
  new `file.save` command through the registry, a centralised unsaved-changes guard covering file
  switch/repo-worktree switch/view switch (Back/Forward included)/window close, and a stale-write
  banner (Reload / Keep editing) rather than a silent overwrite or discard (landed 2026-08-28,
  merged locally — no PR/no remote). **Phase 24 is now feature-complete — all seven themes (A–G)
  have landed.**
- ✅ **E** — find in files: `git grep -z` in git-engine with a pure parser beside it, one read
  channel, and a results panel that opens a file at the line via Shiki's own per-line spans.
  Tracked content only, said out loud (built on `feature/phase-24-e-find-in-files`, not yet
  merged — no PR/no remote)
- ✅ **F** — status badges on tree rows: a `Map` join on a path convention that already matches
  byte-for-byte, off a status cache the sidebar has already fetched, with a directory rollup that
  turned out to need its own literal-ancestor walk rather than `build-change-tree.ts`'s
  chain-collapsing tree (PR-local, landed 2026-08-28)
- ✅ **G** — fs invalidation, live: the fs query keys move into `services/queries.ts` as
  `keys.fs`/`keys.fsRepo`, the watcher invalidates a repo's whole fs cache on a `worktree` event,
  and a new `fs-activity.ts` — mirroring `write-queue.ts`'s `onActivity` shape, per-repoId, 150ms
  settle — suppresses the echo of the app's own fs writes (landed 2026-08-28, merged locally — no
  PR/no remote).

### [Phase 23 — A command palette, and the registry that can feed it](phases/phase-23-command-palette.md)

*The keymap module has named "(later) a command palette" as dispatch source number three since
Phase 9, and the registry cannot feed one as it stands: it lives in `shared/src/keybindings.ts` (not
the `commands.ts` path two docs link to, which has never existed), `COMMAND_IDS` has fifteen entries
against thirteen bindings, and only nine ids have a handler — `repo.open`, `repo.close` and
`view.refresh` have live native menu items that do nothing. A fixes the registry, B lifts the handler
map out of `app.tsx` into the dispatcher all three feeds share, C–D build the surface and the repo's
first fuzzy matcher, E–F are the sources. `Mod+K` is free; `Mod+Shift+P` is Pull and stays Pull.*

- ✅ **A** — reconcile the fifteen-ids/thirteen-bindings split, add a `group` union, add `palette.open`
  (`Mod+k`, global scope so it escapes the terminal) and `palette.files` (`Mod+p`), fix the phantom
  `commands.ts` links (landed 2026-08-28)
- ✅ **B** — `useCommandHandlers(): CommandRuntime` with `enabled` + `disabledReason`, and the four
  cheap dead commands finally wired; `op.*` left to Phase 22 (landed 2026-08-28)
- ✅ **C** — `palette.tsx` + `palette-host.tsx` on the `dialog-host.tsx` shape, a deliberately
  unpersisted `palette-store.ts`, `z-dialog`, and the capture-phase short-circuit that stops `Mod+g`
  firing out from under the input (landed 2026-08-28)
- ✅ **D** — `fuzzy-match.ts` returning `{score, indices}`, the renderer's first matched-character
  highlighting, and one ranking table so a repo name cannot bury a command (landed 2026-08-28).
- ✅ **E** — the source-provider seam plus commands, views, settings pages, repos, worktrees, sessions
  and agents; `VIEW_ICON`/`PAGE_ICON` reused rather than a third icon map (landed 2026-08-28).
- ✅ **F** — branches and tags with two actions only (checkout, reveal in graph) behind an exported
  `PALETTE_SAFE` allowlist with a test asserting no destructive id gets in (landed 2026-08-28,
  merged locally — no PR/no remote; recovered from an interrupted session).
- ✅ **G** — the file finder: `mstudio:fs:list-files` over `git ls-files -z --exclude-standard`, a
  tip-sha-keyed index with an honest truncation notice, opening into the Phase 16 preview pane
  (landed 2026-08-28, merged locally — no PR/no remote; recovered from an interrupted session).
- ✅ **H** — `use-focus-trap.ts` extracted from `popover.tsx`, the only working trap in the repo, and
  retrofitted onto `ConfirmDialog` and `PromptDialog`, which have none (landed 2026-08-28, merged
  locally — no PR/no remote; recovered from an interrupted session). Phase 23 is now
  feature-complete — all eight themes (A–H) have landed.

### [Phase 22 — Stash, the reflog, and writes you can take back](phases/phase-22-stash-and-safety-net.md)

*The client can merge, rebase and review a pull request, and still cannot put work down for five
minutes: `git stash` appears nowhere in the codebase, and `refs/stash` is deliberately dropped by
the ref parser. A is the engine spine B–E read off; B–E are the four surfaces a stash shows up on
(sidebar section, graph pseudo-rows, the inspector, the Changes view). F reverses the MVP's flat
no-force-push ban, `--force-with-lease` only and only in its explicit form, behind the blast-radius
gate Phase 7 already built. G and H are the safety net three files have been promising in doc
comments since Phase 7 — the reflog finally read and browsable, and the app's first ops journal,
first toast primitive and first undo.*

- ✅ **A** — `commands/stash.ts` + `stash-parser.ts` on the write-queue idiom, `mstudio:stash:*`
  channels, and a `'stash-apply'` arm on `ConflictOpSchema` so a conflicted pop is a normal outcome
  (landed 2026-08-28)
- ✅ **B** — a `Stashes` `TreeSection` in the sidebar (`StashRow`, visible even at zero count since
  its own action is the only way to create a repo's first stash), `stashMenu`/`promptStashPush` built
  parallel to `refMenu` rather than forced through `RefSectionKey`, `keys.stashes(repoId)` under
  `keys.repo`. Genuinely landed this time — see the correction below for the earlier false claim.
  (Falsely marked done 2026-08-28, corrected 2026-09-02; really done 2026-09-03, PR #51.)
- ✅ **C** — `features/graph/stash-rows.tsx`: pseudo-rows above the `role="grid"` scroller, the same
  dashed-ring/dashed-lane/italic grammar `UncommittedRow` set, collapsing past two entries into an
  overflow row that opens the sidebar's `Stashes` section. Selection is a new discriminated
  `graphSelection: {kind:'commit',sha} | {kind:'stash',selector} | null` in `ui-store.ts`, replacing
  the old commit-only `selectedCommitSha` — one selection state reached identically from the graph
  and the sidebar's `StashRow`. (Really done 2026-09-03, PR #52 — corrects the 2026-08-28 false claim.)
- ✅ **D** — `readStashDetail`/`readStashFileDiff` in `commands/stash.ts` (a new `readRefDiff` in
  `diff.ts` answers the index part's two-ref diff; tracked/untracked reuse `readCommitFileDiff`
  unchanged), `mstudio:stash:detail`/`mstudio:stash:diff` with their own schemas, and
  `features/stash/stash-inspector.tsx` — three labelled `TreeSection`s (tracked/staged-at-stash-time/
  untracked) over the shared `ChangeTree`/`DiffView`, not tabs, plus Apply/Pop/Branch/Drop header
  actions calling the exact same `useTargetedStash*` hooks the sidebar's `stashMenu` already uses.
  (Really done 2026-09-03, PR #52 — corrects the 2026-08-28 false claim.)
- ✅ **E** — a "Stash changes" toolbar action (whole worktree) and a per-row "Stash file" action in
  the Changes view, both opening a dedicated `StashPushDialog` with keep-index/include-untracked as
  unchecked-by-default checkboxes — reuses Theme B's `useStashPush`. (Falsely marked done 2026-08-28,
  corrected 2026-09-02; really done 2026-09-03, PR #51.)
- ✅ **F** — `forceWithLease: {ref, expect}` on `PushOptions`/`PushRequest` (never a boolean, never
  bare `--force-with-lease`), new `'non-fast-forward'`/`'stale-lease'` `GitOpFailure` codes, entry
  point the per-ref badge menu (offered only after a plain push from that menu came back
  non-fast-forward), behind a new `Settings ▸ Git Safety` opt-in. `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`
  and `sync.ts`/`sync-controls.tsx` all record what replaced the ban. (Falsely marked done 2026-08-30
  in `26e2349`, corrected 2026-09-02; really done 2026-09-03, PR #51.)
- ✅ **G** — `readReflog` via `git reflog show --date=unix -z` (the doc's own `%gt` placeholder does
  not exist in real git — confirmed directly), a best-effort `ReflogAction` classifier, `.git/logs`
  riding the existing `'refs'` `WatchKind`, and the real Reflog tab (ref selector, action filter,
  old→new sha pairs, checkout) replacing Theme H's honest placeholder. (Falsely marked done
  2026-08-30 in the same `26e2349` claim, corrected 2026-09-02; really done 2026-09-03, PR #51.)
- ✅ **H** — a real starter slice (2026-09-02): a custom toast primitive
  (`components/toast.tsx`/`toast-host.tsx` — `@bilo-io/ui` exports none), `OpJournalEntrySchema` +
  an exhaustive undoability classifier, and live Undo wired for `stash-drop` and `branch-delete`
  only (`WIRED_UNDO_OPS`). A prior correction (`a2cd211`) had already caught this theme's earlier
  false "done" claim (2026-08-30) and its own "22 checklist items" count was itself off — the real
  count is 8 (the other 14 it summed belong to the phase's shared Verification section, not Theme
  H). A follow-up ([PR #31](https://github.com/bilo-io/midnite-studio/pull/31)) then found the
  sidebar's `branch-delete` never passed the `journalHint` its wired undo reads, so that Undo would
  have recreated a branch literally named `HEAD` at the wrong sha — fixed, with an e2e spec that
  drives the real row menu (`e2e/journal-undo.spec.ts`). **The rest of `WIRED_UNDO_OPS`**
  ([PR #109](https://github.com/bilo-io/midnite-studio/pull/109), 2026-09-04): `commit`/`reset`
  (mixed reset to the prior `HEAD`), `checkout` (detach to the prior sha), `branch-create` (delete
  the branch it named — stepping off it first when checked out on creation, since git refuses to
  delete the branch you're on regardless of `force`), `branch-rename` (rename back, `headAfter`
  repurposed to carry the new name a plain rename has no sha for), and `stash-push` (pop the newest
  entry). Found the **same** graph/sidebar gap a second time — `branch-create` and `branch-rename`
  each needed the `journalHint` added at both their independent call sites, not just the graph's.

### [Phase 21 — A plural agent roster, and a terminal that knows where it is](phases/phase-21-agent-roster-and-terminal-identity.md)

*Phase 15 built the agent machinery around a roster with one entry in it, and the renderer never
held up its half of the "adding one is an edit, not a release" bargain. A is the contract every
other theme reads off (`icon`, `mode`, `install`, four builtins); B and C are the two surfaces that
stop hard-coding Claude (the session-list mark, the `+` menu); D and E are the live half — a
terminal that knows where it is (OSC 7) and what is running in it (a process probe in main); F is
the header those two finally give something true to say.*

- ✅ **A** — `AgentDefinitionSchema` gains `icon` and `install`; `BUILTIN_AGENTS` grows to four real
  terminal agents (Claude Code `claude`, Antigravity `agy`, Codex `codex`, OpenClaude `openclaude`) —
  and whether a command exists on this machine travels beside them as a separate `AgentStatus`,
  because the definition is config a user hand-edits and the status is a probe result
  (landed 2026-08-27)
- ✅ **B** — three new local brand SVGs beside `claude-icon.tsx` plus an `AGENT_ICONS` registry, so
  `SessionIcon` resolves a mark from the roster instead of hard-coding `<ClaudeIcon>`; all three are
  hand-drawn originals with their provenance written down, and the registry also resolves a curated
  slice of `react-icons/si` for user-added agents (landed 2026-08-27)
- ✅ **C** — the `+` menu goes flat and iconned (New Terminal / Claude Code / Antigravity / Codex /
  OpenClaude), with a main-side install probe — the whole roster in ONE `-lic` shell, per-agent
  framed so an rc-file banner cannot be misread as a path, 30s TTL, and an agent it could not reach
  omitted rather than called missing. `buildNewSessionMenu` is pure, so which rows are dead and why
  is a table test rather than a render (landed 2026-08-27)
- ✅ **D** — OSC 7 live cwd tracking, `liveCwd` in the terminal store, and the header following a
  `cd` through Theme F's resolver — plus `bridge.hostname`, without which the parser rejects every
  payload the canonical emitters actually produce (landed 2026-08-27)
- ✅ **E** — a process probe in main behind `pty:agent-changed`, so an agent started or quit by hand
  swaps the sidebar row's icon; reads process state and acts on nothing. Split into the read
  (`agent-process.ts` — one `ps`, a pure depth-carrying walk, a three-rule matcher that never scans
  arguments) and the cadence (`agent-watcher.ts` — a 750ms quiet debounce, change-only emission, a
  shared snapshot, and a hard rule that a `null` may only take away a mark some probe has actually
  *seen* — a timed grace window would have stripped Claude's mark off an `npm`-installed Claude Code
  the matcher deliberately cannot name). The store's `liveAgentId` is a true tri-state:
  absent ≠ `null` (landed 2026-08-27)
- ✅ **F** — the header loses the word "Terminal": a glyph, the status circle, then a `~`-collapsed
  path with the repo segment emphasised and left-truncation. Brought Theme D's `resolveRepoForPath`
  forward with it — F needs the split point, D needs the same helper against `liveCwd`
  (landed 2026-08-27)

*All six themes have landed (2026-08-27). Three manual passes remain, all needing a real shell or a
packaged app: `cd` between two worktrees and watch the header follow (D), start and quit `codex` and
`agy` inside a shell and watch the row's icon swap both ways (E), and launch the packaged `.app`
from Finder to confirm the install probe still reads the login shell's PATH (C).*

### [Phase 20 — Reviews page & unified diff syntax highlighting](phases/phase-20-reviews-page.md)

*Reviews grows from a sidebar-section stub into a full nav-rail view, and diffs finally get syntax
colour. A is the shell (same `VIEW_FILTERS` mechanism Actions/Tests already use); B and C are the
two read surfaces (list, then detail); D is the highlighting pass shared by every diff surface in
the app; E, F and G are the phase's one deliberate write path — approve/request-changes/comment/
merge, kept in a new `gh-write.ts` so `gh-cli.ts`'s "strictly reads" comment stays true.*

- ✅ **A** — Reviews joins the nav rail as a first-class view, reusing the `VIEW_FILTERS` mechanism
  Actions/Tests already established, hidden for repos with no GitHub remote (landed 2026-08-27)
- ✅ **B** — PR list filterable across every state (open/draft/merged/closed) plus author and
  search, not just the open-only list Phase 17 fetches today; the sidebar section and dashboard
  widget keep asking for open-only via a `state` request param (landed 2026-08-27)
- ✅ **C** — PR detail grows Files/Conversation/Checks tabs, reusing the existing hunk parser for
  PR diffs rather than a second parser — plus a `pull-detail` channel for the head sha no listing
  carries, and Checks matching that sha against the cached run listing rather than costing a
  third subprocess (landed 2026-08-27)
- ✅ **D** — syntax highlighting wired into the one shared `DiffView`, reusing Phase 16's
  already-installed, theme-synced `shiki` highlighter, so Reviews/Changes/Graph render diffs
  identically; deferred per-row through `requestIdleCallback` and cached module-level so it never
  competes with the virtualized scroll path (landed 2026-08-27)
- *(follow-up)* A and B landed against `main` as it stood before Theme C existed; a rebase
  integration mounted `PrDetail` beside the list — a resizable split matching `ActionsView`'s,
  with a new `reviews-store.ts` carrying a sidebar-selected PR number into the view
  (landed 2026-08-27)
- ✅ **E** — inline diff-line comment threads as *rows* in the diff, right-side (added/context)
  lines only for v1 — the phase's highest-unknown piece, and two of its three unknowns turned out to
  be API facts: threads are readable only over GraphQL (REST has no thread object, no `isResolved`
  and no node id), and `gh api`'s `-F` type-guesses its variables. A thread that cannot be anchored —
  outdated, file-level, left-side, or naming a line outside every hunk — renders in a collapsed
  group above the diff rather than against whichever row carries that number now (landed 2026-08-27)
- ✅ **F** — the phase's one deliberate write path: approve/request-changes/comment/merge, in
  `gh-write.ts` beside Theme E's three writes, with the primitives both need extracted into a new
  `gh-shell.ts` so the write module no longer depends on the reader. The merge confirm's blast
  radius comes from `gh pr view --json commits` rather than a local `rev-list --count` — a PR's head
  ref usually is not in this checkout, and `rev-list` against a missing ref reads as zero. All of it
  behind a default-off Settings → Reviews switch that also lists what the app never does
  (landed 2026-08-27)
- ✅ **G** — reviewer re-request off the detail's own `reviewRequests`, Draft → Ready that
  disappears once flipped, and re-run on the Checks tab — two buttons, the failed-only one present
  only on a run that failed. Re-run is the one write that evicts a cache: `gh run rerun` adds an
  attempt to the *same* run id, and main caches a completed run's tree permanently
  (landed 2026-08-27)
- ✅ *(follow-up)* the Playwright suite is green again on `main` — seventeen specs (sixteen of this
  phase's, one of Phase 17's) had gone red against a working product because `app:e2e` sits
  outside the `:test` gate and nothing re-read them after three deliberate decisions moved: a PR
  now opens on **Overview**, the three review scopes now arrive **folded**, and the repos row grew
  a **trailing cluster** that broke a geometry proxy. No product code changed; the landing tab is
  now guarded by one spec instead of thirteen, and four stale screenshots were regenerated
  (285 passed, 0 failed — was 267/17) (landed 2026-08-27)

### [Phase 19 — Dashboard, Actions and Tests as views](phases/phase-19-dashboard-actions-tests.md)

*The nav rail becomes the app's table of contents. A is the shell every other theme renders into;
B and C are the two data layers (local history, and a deeper `gh`); D, E and F are the three
surfaces; G is the one piece that waits on someone else.*

- ✅ **A** — `ViewId` grows to seven, Dashboard rides `NavConfig.pinned` (ungrouped, above the
  sections), Actions/Tests join the rail, and one `VIEW_FILTERS` table reshapes the sidebar on two
  axes — sections and dirty-only — folding Phase 17's Changes filter in rather than leaving it a
  parallel one-off, with a "show all sections" escape hatch (landed 2026-08-26)
- ✅ **B** — `git-engine/src/stats/`: one `--all` history pass feeding a local-timezone commit
  calendar, contributors by email, opt-in churn, and repo health — cached on a digest of every
  ref tip rather than HEAD, because an `--all` traversal changes when any branch moves
  (landed 2026-08-26)
- ✅ **C** — forge deepening through the existing `gh` wrapper: `gh issue list`,
  `gh run view --json jobs`, `gh run view --log`, plus `gh workflow list` for the `.yml` paths a
  run listing never carries — and an Issues sidebar section with a job peek under each run
  (landed 2026-08-26)
- ✅ **D** — the dashboard: a `react-grid-layout` v2 board with theme-token overrides, a widget
  registry that gates on the repo's data sources, per-repo persisted layout, and one board-wide
  author filter every widget reads (landed 2026-08-26)
- ✅ **E** — the Actions view: runs sectioned by workflow **id** (a name is whatever `name:` says
  this morning), a job/step tree with only the failed jobs expanded, one whole-run log fetch split
  in the renderer, a virtualised ANSI pane whose folding changes which rows *exist*, and
  Open-in-GitHub for anything stateful (landed 2026-08-26)
- ✅ **F** — Tests discovery: suites parsed from package.json/moon/vitest/playwright configs,
  monorepo-aware, classified by kind, with "run in terminal" and **no** new trust surface
  (landed 2026-08-27)
- ✅ **G** — real suite execution through a generalised `process-runner.ts` (shared with 18E's
  diagnostics), per-suite trust, `--reporter=json` parsing with an exit-code-plus-raw-output
  fallback, and a live output stream (landed 2026-08-27)

*Open: three human passes — the dashboard against a large real repository, the Actions view
against a real failing matrix run, and `react-grid-layout`'s stylesheet in both themes. All seven
themes are otherwise landed.*

### [Phase 18 — Footer system monitor + repo diagnostics](phases/phase-18-footer-monitor-diagnostics.md)

*The footer's empty right half becomes the app's live-state strip. A and B are the spine — C, D
and F all read the sample stream they push; E is the trust boundary F prompts through.*

- ✅ **A** — darwin metric probes in main (`vm_stat`, `ioreg`, `os.cpus()` deltas, `statfs`), each
  a pure parser behind a thin `execFile`, with a self-disabling GPU probe (landed 2026-08-26)
- ✅ **B** — `mstudio:metrics:*` contract: an all-optional `MetricSample`, a one-way sample stream,
  and an adaptive sampler that stops on window blur (landed 2026-08-26)
- ✅ **C** — metrics store with a time-windowed, flat-seeded buffer, a data-colour palette,
  geometry-as-data, and a hand-rolled area chart + sparkline with a cadence-change rule
  (landed 2026-08-26)
- ✅ **D** — the first real click-toggled popover primitive, plus the footer's slot-based right
  cluster: dot, percentage and sparkline per metric (landed 2026-08-26)
- ✅ **E** — the diagnostics trust policy, written down: per-repo opt-in, a `repoId`-only channel,
  a configurable command, a ranked parser-gated detector registry and a total, *streaming*
  eslint-JSON parser (landed 2026-08-26)
- ✅ **F** — the diagnostics segment (absent ≠ zero, sidebar-selection-driven) and a Monitor &
  Diagnostics settings page, now genuinely built on Theme E's contract: the `contract-shim.ts`
  F compiled against while E was in flight is deleted, and the duplicate `diag` mock the rebase
  left shadowing E's is folded into one (landed 2026-08-26)

*Open: three human passes — cross-checking the readings against Activity Monitor, the idle
battery cost over an hour, and the diagnostics fail-soft matrix (Theme E). Also noted while
landing D: `graph-themes.spec.ts` has twelve pre-existing failures on `main` (a stale
`link`/`button` locator for Settings, plus cross-test ordering the timeout was masking) —
Phase 14's, not this phase's.*

### [Phase 17 — Repositories workbench + forge](phases/phase-17-repos-workbench.md)

*The sidebar stops being a read-mostly tree. A is the spine — B, C and the "View all changes"
buttons all read the per-checkout status it fetches; E is the surface D and F open into.*

- ✅ **A** — per-worktree `git status` via `useQueries`, the accent change-count pill on
  worktrees, branches and the collapsed repo row
- ✅ **B** — the Changes view filters the tree to checkouts that have changes, with a visible,
  reversible toggle
- ✅ **C** — context menu + hover ellipsis on every actionable node; destructive verbs behind a
  danger-themed confirm (blast radius for commits, named warnings for everything else)
- ✅ **D** — "View all changes": a per-file accordion diff of one checkout, lazy per file,
  expand/collapse all with a stated cap
- ✅ **E** — the workbench tab strip; the Changes view becomes a tabbed content area with a
  permanent working-tree tab
- ✅ **F** — `mstudio:forge:*` over the user's own `gh` CLI: Actions and Reviews sections, run and
  PR tabs, and the `ChecksVerdict` producer that `outstanding.md` had been waiting for

*Open: two manual passes — the packaged-app screenshots (Electron will not start in a
non-interactive session) and the `gh`-availability matrix.*

### [Phase 16 — Folder explorer, preview pane + settings pages](phases/phase-16-explorer-and-settings-pages.md)

*The app grows real pages: a read-only Folder view with a preview pane, and Settings split into four pages behind an inner sidebar — including an Agent page into `~/.claude`. B is the spine (the fs IPC + path jail); C/D/E all read through it; A is independent chrome.*

- ✅ **A** — nav rail regrouped (Folder above Graph, Settings pinned bottom) + the settings page shell (merged 2026-08-26)
- ✅ **B** — read-only `mstudio:fs:*` IPC with a path-confinement jail (repo root + `~/.claude`) and a jailed `mstudio-file://` protocol (merged 2026-08-26)
- ✅ **C** — lazy repo file tree, dotfiles shown, gitignored dimmed and collapsed (merged 2026-08-26)
- ✅ **D** — preview pane: shiki code, rendered markdown w/ source toggle, images/PDF/media, fallback card (merged 2026-08-26)
- ✅ **E** — Agent settings page: `~/.claude` tree + preview, Claude version card, Update streams / Uninstall pastes into the terminal (merged 2026-08-26)

*Closed: both real-app manual verification passes done by the user on 2026-08-26 — the
phase is complete.*

- ✅ **F** (follow-up) — the settings sidebar becomes grouped and collapsible (General / Tools /
  System, one glyph per page), and Appearance gains the side-navigation control that exposes the
  rail's third mode (merged 2026-08-26)

### [Phase 15 — Multi-terminal sessions + agents](phases/phase-15-multi-terminal-sessions.md)

*Several terminals at once — shells and coding agents — in a VS Code-style sidebar, surviving a restart with their scrollback. A is the spine: B/C/D all render what A persists. E is independent and also covers the repos sidebar.*

- ✅ **A** — session record + capped scrollback in main; `terminal:*` channels; agent roster with an `agents.json` override
- ✅ **B** — per-session renderer model; multi-xterm host; the cwd-change kill effect deleted (fixes a dead pane)
- ✅ **C** — maximize chevron and the `+` → New Terminal / New Agent menu
- ✅ **D** — the session sidebar, dockable left/right, with a Claude mark for agent sessions
- ✅ **E** — drag-to-reorder via `@dnd-kit/sortable`, for terminals *and* repos
- ✅ **verification** — pty/terminal schema sweep, a fake pty that talks back, nine e2e specs and
  both screenshots; found and fixed two ptys per terminal, self-reviving restored sessions, and an
  `agentId`/`kind` pairing the schema documented but never enforced. One manual item is left for a
  human: quit, relaunch, and confirm `ps` shows no surviving shells

### [Phase 12 — Commit inspector + live badges](phases/phase-12-commit-inspector.md)

*Phase 5's detail stub is now a real inspector, its badges are controls, and its rows read at two densities. **All six themes have landed**; two manual passes remain, both needing a packaged app or a real remote.*

- ✅ **A** — markdown + linkify commit bodies: clickable SHAs, URLs, `#123`, emails, trailer styling (2026-08-26)
- ✅ **B** — inspector rebuild: sha header + copy button, tree ⇄ list toggle, parent navigation, `stat` dropped from the wire, `repo:rev-parse` + `clipboard:write-text` channels (2026-08-26)
- ✅ **C** — ref badges as controls: `isHead` glow, hover-expand pull/push with real-count tooltips, branch-scoped sync in the context menu (2026-08-26)
- ✅ **D** — real diffs: `mstudio:commit:file-diff` channel, hunk parser, one restrained `<DiffView>` shared with the status panel (branch `feature/phase-12-diffs`)
- ✅ **E** — `Remote` domain type, `listRemotes`, ssh/https URL normaliser, guarded `shell:open-external` (2026-08-26)
- ✅ **F** — graph row polish: lane-accent selection bar, a CVD-safe palette (+ the `laneInk` bug it exposed), badge width cap, row density, working-copy row (2026-08-26)

### [Phase 14 — Graph themes + avatars](phases/phase-14-graph-themes.md)

*Four selectable graph styles, avatars in the commit bubble, and the Settings view to hold the picker. A is the spine — B/C/D all render through it.*

- ✅ **A** — `GraphTheme` descriptor + four styles; theme-driven `graph-svg`
- ✅ **B** — Gravatar avatars in the node, generated fallback; Author column deleted
- ✅ **C** — dedicated BRANCH / TAG column, `graphColumns` migration
- ✅ **D** — author filter (dim, never remove); shared multi-select menu
- ✅ **E** — Settings view + live style picker, plus the shell's appearance runtime

### [Phase 13 — UI polish](phases/phase-13-ui-polish.md)

- ✅ **A** — lucide, motion keyframes, applyMotion, Tooltip, IconButton, cascade
- ✅ **B** — use-resizable + ResizeHandle, persisted ui-store, four resizable panes
- ✅ **C** — TreeSection, per-repo collapsible Local/Remotes/Tags/Worktrees, icon overhaul
- ✅ **D** — lockable nav rail (navMode persisted, pin in the brand slot)
- ✅ **E** — theme toggle + sync cluster in the title bar, three dead CommandIds wired
- ✅ **F** — graph column headers, resizable columns, multi-select branch filter
- ✅ **G** — cascading fade-in, view cross-fade, once-per-stream graph fade

### [Phase 11 — Packaging + docs](phases/phase-11-packaging.md)

- ✅ **A** — electron-builder arm64, afterpack/install-local scripts, CI workflow, README/docs final

### [Phase 10 — Watcher / live refresh](phases/phase-10-watcher.md)

- ✅ **A** — fs.watch repo watcher, own-write suppression, kind→invalidation map

### [Phase 9 — Integrated terminal + keybindings](phases/phase-9-terminal-and-keybindings.md)

- ✅ **A** — pty-service (node-pty in main), xterm panel, Ctrl+` keybinding service + menu + footer bar

### [Phase 8 — Drag-drop ops + conflicts](phases/phase-8-drag-drop-ops.md)

- ✅ **A** — merge/rebase/cherry-pick + sequencer, @dnd-kit gestures, conflict banner

### [Phase 7 — Graph interactions](phases/phase-7-graph-interactions.md)

- ✅ **A** — context menus, checkout, branch/tag create, blast-radius-gated reset/delete

### [Phase 6 — Status / stage / commit / sync](phases/phase-6-status-and-sync.md)

- ✅ **A** — stage/unstage/discard/commit, ahead-behind chips, fetch/pull/push (no force)

### [Phase 5 — Commit graph, read-only](phases/phase-5-commit-graph.md)

- ✅ **A** — streaming log service, virtualized SVG rows, ref badges, detail stub

### [Phase 4 — Repo open/list + worktree sidebar](phases/phase-4-repos-and-worktrees.md)

- ✅ **A** — repo registry + persistence, VSCode-style sidebar with nested worktrees, add/remove

### [Phase 3 — Electron shell boots](phases/phase-3-electron-shell.md)

- ✅ **A** — frameless window, AppFrame/TitleBar/theme on @bilo-io/ui+shell, preload windowChrome bridge

### [Phase 2 — Lane layout engine](phases/phase-2-lane-layout.md)

- ✅ **A** — straight-lane layout with recycling, LaneLayoutSession streaming, stable colors

### [Phase 1 — Shared contracts + git-engine parsers](phases/phase-1-contracts-and-parsers.md)

- ✅ **A** — zod domain/IPC contracts, dugite exec + write queue, NUL-delimited parsers, smoke script

### [Phase 0 — Scaffold](phases/phase-0-scaffold.md)

- ✅ **A** — proto/moon/pnpm skeleton, four packages, boundary lint rules, GH Packages auth proven

## Conventions

- One phase per PR where practical; claim a theme in the `🔄 WIP` column (commit to `main`) before branching; update this table + `done.md` as work lands.
- Every phase ends green on `moon run :typecheck :lint :test` plus its own verification list.
- Visual phases (3–9) capture a screenshot as part of verification.
