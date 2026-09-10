# Phase 84 — Live everywhere, lighter when hidden

> **Builds on:** [Phase 10](phase-10-watcher.md) (one `RepoWatcher` per repo in
> main, `fs.watch` + debounce + own-write suppression), [Phase 55](phase-55-multi-window-studio.md)
> Themes E/I (cross-window relay, `broadcastToAllWindows(watchEvent)`), [Phase 36](phase-36-performance-diet.md)
> and [Phase 45](phase-45-leak-audit.md) (the `scripts/perf/` harness, `budgets.json`, the
> heap-diff instrument), [Phase 46](phase-46-lock-screen-and-motion.md) (the motion policy and its
> guard test) and [Phase 30](phase-30-terminal-hardening.md) (scrollback lives in main, so a
> terminal can be thrown away and rebuilt).
>
> **Scope guardrails:** Two promises and one look. **Live:** every window — main and every popout —
> reflects a git or forge change without anyone pressing reload, and the timers that make that
> happen (auto-fetch, forge polling) run *once*, in main, gated on whether anyone can see the app.
> **Lighter:** a panel, tab or view that is hidden long enough gives its memory back, and comes
> back fast from state main already holds. **The look:** panels and lists fade in on reveal in a
> top-to-bottom cascade, under full motion only. Out of scope: a main-side *repo state snapshot*
> (N windows → one set of git subprocesses — the natural Phase 85, and Theme D lays its
> groundwork), Monaco slimming ([Phase 77](phase-77-thirteen-megabytes-of-editor.md)), and the
> `WebContentsView` engine itself ([Phase 32](phase-32-browser-engine-and-tabs.md)).
>
> **Effort tags:** **(S)** ≤ half-day · **(M)** 1–2 days · **(L)** 3+ days.

---

## Background

The tracker says Phase 55 Theme I shipped "one watcher, N consumers" and Theme E shipped
cross-window sync. Both are true and neither is the whole story. Main runs exactly one
[`RepoWatcher`](../../../packages/git-engine/src/watch/repo-watcher.ts) per repo
([`watch-service.ts`](../../../packages/desktop/src/main/watch-service.ts), reconciled from the
registry) and fans every event to every window with `broadcastToAllWindows(EVENT_CHANNELS.watchEvent)`.
But the only place that *listens* is
[`app.tsx:616`](../../../packages/app/src/app.tsx) — `useWatchInvalidation(selectedRepoId)` is
mounted in the main window and nowhere else. [`detached-root.tsx`](../../../packages/app/src/detached-root.tsx)
builds its own `QueryClient` (`staleTime: Infinity`) and never subscribes, so a detached Graph or
Changes window receives the event and drops it. `relayWatchEvent` in
[`broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) — the old fallback —
has zero callers since Theme I removed the rebroadcast, and its test still passes because it tests
a function nothing runs. That is the "I have to reload the other window" bug, exactly, and it is a
one-line mount plus a deletion.

The rest of the liveness story is timers in the wrong place. `useAutoFetch()` lives in the
renderer (`app.tsx`, main window only, gated on `document.visibilityState`), so a detached Graph
never sees remote movement — and if popouts *also* ran it you would get duplicate `git fetch`
storms. Forge data (runs, PRs, issues, projects) has no push and no poll at all: every forge query
in [`queries.ts`](../../../packages/app/src/services/queries.ts) is `FORGE_STALE_MS = 60_000` and
freshness is whatever navigation triggers. `loopRunsChanged`/`workflowRunChanged` already show the
ping-then-refetch shape forge lacks. And `WindowDescriptor.repoId` is hardcoded `null` in
`listWindows()`, so main cannot tell which repo a window is showing and cannot scope anything.

On the memory side the app is honest about *what* it keeps and quiet about *how long*. Views are
keyed and unmounted on switch (`<div key={activeView}>`), so returning to Graph re-streams from
scratch; the one keep-alive exception is the terminal-maximized case, which hides the view with
`display:none` to preserve the row buffer and has no ceiling or timeout. The terminal panel stacks
**every** open session `absolute inset-0` with one visible, and
[`xterm-budget.ts`](../../../packages/app/src/features/terminal/xterm-budget.ts) rations the
twelve WebGL contexts by demoting losers to the DOM renderer — it never disposes anything. Hidden
browser tabs are `view.setVisible(false)` in
[`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts): the web contents and
their renderer process stay fully alive. Each popout boots the full app bundle, its own
`QueryClient` and every store, and idle-preloads the terminal view it may never render.

The motion half is mostly built. [`lib/cascade.ts`](../../../packages/app/src/lib/cascade.ts)
(`cascadeStyle`, `CASCADE_STEP_MS = 18`) plus `.cascade-delay` and `animate-fade-in-up` already
cascade the graph, repos panel, forge sections, actions/issues/reviews lists and the palette. What
is missing is a *shared* reveal gate: the graph hand-rolls one (`isCascading`/`prevRequestId` in
[`graph-view.tsx`](../../../packages/app/src/features/graph/graph-view.tsx)) keyed on `requestId`,
which **changes on every watcher-driven re-stream** — so the graph re-cascades on every save today,
and Theme A would make every popout do the same. The repos panel has no gate at all. File tree,
terminal, companion and FAB panel have no fade. Reduced-motion safety for `.cascade-delay` rests on
`@bilo-io/shell`'s universal `html[data-motion='reduced'] *` reset rather than an app-owned rule,
and the guard test ([`styles-motion-guards.ts`](../../../packages/app/src/styles-motion-guards.ts))
scans only `styles.css` — the `fade-in`/`fade-in-up` keyframes live in `tailwind.config.ts` and are
invisible to it.

---

## Deliverables

### Theme A — The broadcast lands (S)

- [ ] **A.1** Mount `useWatchInvalidation(repoId)` from [`services/watch-invalidation.ts`](../../../packages/app/src/services/watch-invalidation.ts) inside `DetachedShell` in [`detached-root.tsx`](../../../packages/app/src/detached-root.tsx), against the popout's own `QueryClient`. A detached page or panel now invalidates on the same `watchEvent` the main window does; its `staleTime: Infinity` stays — invalidation is the refresh path, and now it fires.
- [ ] **A.2** Delete `relayWatchEvent` from [`broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) and its case in `broadcast-sync.test.ts` (~L255). Rewrite the three stale module comments — `broadcast-sync.ts` (describes the removed rebroadcast), `detached-root.tsx` ("a snapshot as of mount until the first relayed change"), `watch-invalidation.ts` ("Mounted in EVERY window") — so each says what the code now does.
- [ ] **A.3** `view.refresh` (chord-free, palette/menu) reaches a popout: confirm the `menuCommand` route runs `invalidateForWatchKind(client, repoId, 'head')` + restream against the popout's client, or wire it, so a detached window has the same manual escape hatch the main window has.
- [ ] **A.4** Test: render `DetachedRoot` for a page role under a fake bridge, emit `watch.onEvent({kind:'refs'})`, assert the popout `QueryClient` invalidates `keys.refs`/`keys.status` and the graph store requests a restream. (The e2e suite runs against a mocked bridge and cannot open a real second Electron window — same precedent as [Phase 55 F.3](phase-55-multi-window-studio.md); the real two-window check is a human pass in Verification.)

### Theme B — Auto-fetch moves to main (M)

- [ ] **B.1** New [`desktop/src/main/fetch-scheduler.ts`](../../../packages/desktop/src/main/fetch-scheduler.ts) *(new)* beside `watch-service.ts`: one timer per registered repo (`listRepos()`), reconciled on repo open/close exactly as `reconcileWatchers` is; each tick runs `fetch` through git-engine's per-repo [write queue](../../../packages/git-engine/src/exec/write-queue.ts) so it never races a user op on `index.lock`.
- [ ] **B.2** The gate is app-wide, not per-document: a tick runs only if some window `isVisible() && !isMinimized()` and `powerMonitor.getSystemIdleState(idleSec)` is not `idle`/`locked`. Paused ticks do not accumulate; the first `show`/`focus` after a pause runs one catch-up fetch (the `visibilitychange` catch-up `useAutoFetch` does today, hoisted).
- [ ] **B.3** A fetch that moved any ref broadcasts `watchEvent {kind:'refs'}` explicitly (compare remote-tracking ref SHAs before/after, or parse fetch's `-v` output) — the watcher's own-write suppression via [`fs-activity.ts`](../../../packages/git-engine/src/exec/fs-activity.ts) would otherwise swallow the fs event for main's own write. A fetch that moved nothing broadcasts nothing.
- [ ] **B.4** Settings → main: `ui-store` stays the owner of `autoFetchEnabled`/`autoFetchIntervalMs` (and F's discard threshold, E's mount count), and pushes a small snapshot over a new `CHANNELS.settingsSync` (`mstudio:settings:sync`) on change and on boot; main keeps it in a `settings-mirror.ts` with the same defaults. Renderer-owned, main-mirrored — no second settings store.
- [ ] **B.5** Delete `useAutoFetch` from `app.tsx`. The `Settings ▸ Git` switch and interval field are unchanged; they now drive main's scheduler through B.4.
- [ ] **B.6** Failure is quiet and visible: a failed fetch (offline, auth, missing remote) is logged once through the Phase 65 logger, backs off exponentially per repo (cap 10 min), and is surfaced on Theme I's dot as amber with the reason — no toast per tick.

### Theme C — Forge poller, interest-based (M)

- [ ] **C.1** Contract in [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) + `schemas.ts`: `CHANNELS.forgeSubscribe`/`forgeUnsubscribe` (`mstudio:forge:subscribe`/`…:unsubscribe`, payload `{repoId, kind}` with `kind: 'runs'|'pulls'|'issues'|'projects'`) and `EVENT_CHANNELS.forgeChanged` (`mstudio:forge:changed`, same shape plus `at`). Preload exposes `forge.subscribe/unsubscribe/onChanged` on the bridge.
- [ ] **C.2** New [`desktop/src/main/forge/forge-poller.ts`](../../../packages/desktop/src/main/forge/forge-poller.ts) *(new)*: a refcounted subscription registry keyed by `{repoId, kind}` with subscriber `webContents.id`s; a window's `closed` drops all of its subscriptions (the [`stream-registry.ts`](../../../packages/desktop/src/main/stream-registry.ts) pattern). Each active key polls at `FORGE_POLL_MS = 60_000` through the existing [`gh-cli.ts`](../../../packages/desktop/src/main/forge/gh-cli.ts)/`gh-graphql.ts` list calls and `gh-cache.ts`. Zero subscribers = zero polling; nothing runs for a repo nobody is looking at.
- [ ] **C.3** Change detection: each poll hashes a compact projection (ids + `updatedAt` + status/conclusion) and broadcasts `forgeChanged` only when the hash differs from the last one for that key — to the windows subscribed to it (Theme D narrows further by repo). Same visibility gate as B.2.
- [ ] **C.4** Rate limits are a first-class state: read `x-ratelimit-remaining`/`reset` where `gh api` exposes them and treat a 403 rate-limit body as a signal; back off exponentially to a 10-minute ceiling; expose `{backoffUntil, reason}` for Theme I.
- [ ] **C.5** Renderer: `useForgeSubscription(repoId, kind)` in `services/`, mounted by the Actions, Reviews, Issues and Projects views (and any status-bar forge chip that renders counts), subscribing on mount and unsubscribing on unmount; `forgeChanged` → `invalidateQueries(keys.forge.<kind>(repoId))`. Works identically in a popout because it rides the bridge, not `app.tsx`.
- [ ] **C.6** Detail queries of the *open* item (PR detail, checks, comments; run detail/logs for a still-running run) are invalidated when their list key pings, so the pane you are reading updates too. PR diffs stay deliberately uncached, as today.

### Theme D — A window knows its repo (S)

- [ ] **D.1** `WindowDescriptor.repoId` becomes real: the renderer reports `selectedRepoId` over a new `CHANNELS.windowReportRepo` (`mstudio:window:report-repo`) on change and on mount; [`window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts) stores it on the `Map` entry and `listWindows()` returns it instead of `null`.
- [ ] **D.2** `broadcastToAllWindows` gains a sibling `broadcastToWindowsOnRepo(repoId, channel, payload)` used by the watcher fan-out, B.3 and C.3. A window whose `repoId` is still `null` (not yet reported) receives everything — fail-open, never fail-silent.
- [ ] **D.3** Diagnostics: the window diagnostics panel ([Phase 55 G](phase-55-multi-window-studio.md)) gains a per-window row — role, `repoId`, last watch event at, last forge ping at, subscriptions — the same data Theme I's popover shows, in the place a debugger looks.

### Theme E — Terminal unload + rehydrate (M)

- [ ] **E.1** Pure policy module `features/terminal/session-mount-policy.ts` *(new, tested)*: given `{visibleId, recentOrder, hiddenSince, now, keepRecent, disposeAfterMs}` returns the set of session ids to keep mounted — the visible one plus the `keepRecent` most-recently-viewed (default **3**, a Settings field), everything else once hidden for `disposeAfterMs` (default **2 min**).
- [ ] **E.2** [`terminal-panel.tsx`](../../../packages/app/src/features/terminal/terminal-panel.tsx) renders an inert placeholder for a session outside the mounted set instead of its `absolute inset-0` xterm; disposing releases the WebGL slot through `xterm-budget.ts`, which grows from "demote to DOM" to "dispose" as its last rung.
- [ ] **E.3** Rehydrate on reveal: a fresh xterm replays `readScrollback` from [`pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts) (already the source of truth — [Phase 30 C](phase-30-terminal-hardening.md)) then subscribes to live `ptyData` via `subscribeWindowToPty`. Define the hand-off so there is no gap and no duplicate between the last replayed byte and the first live one (subscribe-then-replay with an offset, or a sequence number on the ring) — and test it.
- [ ] **E.4** The rehydrating session wears Theme K's terminal fade rather than flashing an empty canvas; `fitSignal` fires after replay so the first live frame is already sized.
- [ ] **E.5** One policy for every terminal host: the docked panel, the detached terminal window, and the Kanban card terminals ([`card-terminal.tsx`](../../../packages/app/src/features/projects/board/card-terminal.tsx) — [Phase 51 C](phase-51-terminal-steadiness.md) cites a `card-terminal-mounts.ts` beside it that no longer exists; its budget now lives in `xterm-budget.ts`) all consult E.1 rather than each carrying its own budget.
- [ ] **E.6** Number: `memory-report.mjs` with 10 sessions open and 1 visible, before and after, in `done.md`.

### Theme F — Browser tab discard (M)

- [ ] **F.1** [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts) gains `discardBrowserTab(tabId)`: snapshot `{url, title, favicon}` (and navigation history if `webContents.navigationHistory` on the pinned Electron exposes it), close the `WebContentsView`'s contents, keep the tab record. `activateBrowserTab` on a discarded tab recreates the view in the same partition and loads the snapshot URL — cookies and logins survive because the session partition does; in-page form state does not, and the doc says so.
- [ ] **F.2** Discard policy in main: a tab is eligible when hidden (`!visible`, or its owner window hidden/minimized) for `browserDiscardMs` (default **10 min**, `Settings ▸ Browser`, `0` = never); never the active tab of a visible window, never a `keepAwake` tab, never a tab that `isCurrentlyAudible()` or has a download in flight.
- [ ] **F.3** The shared `BrowserTab` schema gains `state: 'live'|'sleeping'` and `keepAwake: boolean`. The tab strip shows a sleeping glyph on a discarded tab (Chrome's memory-saver affordance), and the tab context menu gets **Keep awake** — the per-tab opt-out.
- [ ] **F.4** Third-party apps ([Phase 83](phase-83-third-party-apps-rail.md)'s `apps-service.ts`) are excluded from discard by default — Spotify playing in the background is the canonical case — with a per-app opt-in beside their on/off switch.
- [ ] **F.5** Number: RSS with 8 tabs open, 1 active, after the threshold — before and after; the discarded tabs' renderer processes are gone from `ps`.

### Theme G — Bounded keep-alive for heavy views (M)

- [ ] **G.1** Generalise `app.tsx`'s terminal-maximized `display:none` case: [`view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx) gains a per-view `keepAlive?: {ttlMs, maxRows?}`; Graph and Changes opt in. The view box renders the last-left kept-alive view hidden beside the active one until its TTL (default **5 min**) expires, then unmounts it.
- [ ] **G.2** Invalidations while hidden are deferred, not executed: a kept-alive Graph that receives `restreamGraph` marks itself stale and re-streams on reveal (the `terminalTween.settled` pattern already in `app.tsx`), so a hidden view costs no git subprocesses — and, per K.2, the re-stream on reveal does not cascade.
- [ ] **G.3** Ceiling: if the graph store's row buffer exceeds `maxRows` (default 20k) the view unmounts immediately instead of waiting for the TTL — memory stays bounded on a 100k-commit repo.
- [ ] **G.4** At most **one** kept-alive view at a time — the last one left. Cycling three views never holds two hidden.
- [ ] **G.5** Number: Graph → Files → Graph time-to-first-row before and after; heap of the kept-alive Graph at 20k rows.

### Theme H — Popout diet (M)

- [ ] **H.1** Audit `app.tsx`'s top-level effects and list what a popout runs for nothing; then in [`main.tsx`](../../../packages/app/src/main.tsx)/`detached-root.tsx` a popout skips `idlePreload(loadTerminalView)` unless its role is the terminal, and skips companion, optimizer, councils and system-monitor bootstrap it can never render.
- [ ] **H.2** Store hydration: any store that reads a large payload at import or mount (session history, loop runs, workflows) becomes lazy for roles that do not show it; `ui-store`'s persist is small and stays.
- [ ] **H.3** The popout `QueryClient` gets a bounded `gcTime` and only the role's queries are ever mounted, so a page popout left open for a day does not accumulate cache.
- [ ] **H.4** Budget: `memory-report.mjs` learns `--popout=<role>`; `budgets.json` gets `popoutRss` — measured first, then budgeted with headroom.

### Theme I — Liveness dot (S)

- [ ] **I.1** Per-window `liveness-store.ts` in `store/`: `lastWatchAt`, `lastForgeAt`, `fetch: {nextAt, backoffUntil, error}`, `forge: {subscriptions, backoffUntil, error}`, `watcherError`. Fed by `watch.onEvent`, `forgeChanged`, and a new `EVENT_CHANNELS.syncStatus` (`mstudio:sync:status`) main pushes whenever the scheduler or poller changes state (paused, resumed, backed off, failed).
- [ ] **I.2** A status-bar zone ([Phase 27](phase-27-status-bar-and-browser-panel.md)'s zoned bar with overflow) in the main window **and every popout**: a dot — green (an event or a healthy tick within the interval), amber (paused: idle / no visible window / offline / backoff, with the reason), red (the watcher failed for this repo). Hover: "synced 12s ago · auto-fetch in 4m · forge: 3 subscriptions".
- [ ] **I.3** Click opens a small popover with Theme D.3's per-window table and a **Refresh now** that runs `view.refresh`.
- [ ] **I.4** `data-testid` and a `data-sync-state` attribute so the tests in A.4 and K.8 assert on it.

### Theme J — Numbers, not adjectives (S)

- [ ] **J.1** Baseline before any theme lands, committed into this doc's Verification section: `memory-report.mjs` main-window RSS idle; +10 terminal sessions; +8 browser tabs; +1 detached Graph popout; `idle-cpu.mjs --blurred`. Packaged-equivalent app (`moon run app:build desktop:bundle` first), per the `scripts/perf/` rule.
- [ ] **J.2** After each of E, F, G and H: the same table, appended to that theme's `done.md` entry.
- [ ] **J.3** `budgets.json`: `popoutRss` (H.4) and `hiddenTerminalSessionRss` (E) — measured, then budgeted.
- [ ] **J.4** `idle-cpu.mjs --blurred` must not regress from B/C: with no visible window the scheduler and poller spawn **zero** subprocesses over the window — the script samples `ps` for `git`/`gh` children of main and asserts it.

### Theme K — Cascading reveal, everywhere (M)

- [ ] **K.1** New [`lib/use-cascade-reveal.ts`](../../../packages/app/src/lib/use-cascade-reveal.ts) *(new)*: `useCascadeReveal({revealKey, steps = CASCADE_MAX_STEPS, stepMs = CASCADE_STEP_MS})` → `{active, styleFor(index)}`. Arms on mount and whenever `revealKey` changes, self-clears after `(steps + 1) × stepMs + 250 ms`, and returns inert styles when `useResolvedMotion()` ([`appearance-store.ts`](../../../packages/app/src/store/appearance-store.ts)) is `'reduced'`. Replaces the hand-rolled `isCascading`/`prevRequestId`/timeout in `graph-view.tsx` (~L237).
- [ ] **K.2** Mount ≠ refresh. The graph's `revealKey` is `${selectedRepoId}:${revealCount}` — **never** `requestId` or `restreamNonce` — so a watcher re-stream, a query invalidation, an auto-fetch or a forge ping updates rows in place with no cascade. The repos panel ([`repos-panel.tsx`](../../../packages/app/src/features/repos/repos-panel.tsx), four row renderers), [`forge-sections.tsx`](../../../packages/app/src/features/repos/forge-sections.tsx), `run-list.tsx`, `issue-list.tsx`, `reviews-list.tsx` move onto the same key. Replays on: first mount, re-reveal after hidden, repo switch. Never on data.
- [ ] **K.3** New list surface: the file explorer ([`file-tree.tsx`](../../../packages/app/src/features/files/file-tree.tsx)) cascades its visible top-level entries on reveal; expanding a folder cascades that folder's children once, keyed on the expand.
- [ ] **K.4** Panel fades off the existing size tweens' `settleCount` ([`use-reveal.ts`](../../../packages/app/src/components/use-reveal.ts)): the terminal fades in as a whole panel on **every** reveal (`terminalTween` — xterm owns its canvas, so no per-row); the companion (`companionTween`), the FAB/Loops panel (`fabPanelTween`: panel fade plus a one-shot cascade of its tab row, distinct from the infinite `.tab-loop-shimmer`) and the repos panel (`reposTween`) do the same; the browser pane keeps its `useReveal` opacity tween. A popout's first paint fades in through `DetachedShell`.
- [ ] **K.5** Every view: `view-registry.tsx` gains `cascade?: boolean`; the `<div key={activeView}>` box keeps its whole-box `animate-fade-in`, and list-shaped views — Graph, Changes, Files, Actions, Issues, Reviews, Projects, Sessions, the Dashboard's tiles — opt into child cascade through K.1 with one flag each rather than hand-wiring.
- [ ] **K.6** Reduced motion is app-owned: `.cascade-delay`, `animate-fade-in` and `animate-fade-in-up` get their own `@media (prefers-reduced-motion: reduce) { html:not([data-motion='full']) … { animation: none } }` block in `styles.css` instead of leaning on `@bilo-io/shell`'s universal reset; `styles-motion-guards.ts` learns to scan `tailwind.config.ts`'s keyframes so the guard can see them.
- [ ] **K.7** Budget: a full cascade settles in ≤ ~400 ms (20 steps × 18 ms + a 160 ms fade); no new infinite animation anywhere (the Loops tab shimmer stays the only one); `idle-cpu.mjs` is unchanged once settled.
- [ ] **K.8** Tests: `use-cascade-reveal.test.ts` (arms on `revealKey` change, not on data change; inert under `reduced`); a unit test that a `watchEvent` → restream does **not** re-arm the graph cascade; a pixel-diff ([Phase 82 D](phase-82-the-pyramid-righted.md)'s `setReducedMotion`) proving a cascading panel under `reduced` is byte-identical to its settled frame.

---

## Files this phase touches

| Area | Files |
|------|-------|
| Contract | [`shared/src/ipc/channels.ts`](../../../packages/shared/src/ipc/channels.ts) — `forgeSubscribe`/`forgeUnsubscribe`/`forgeChanged`, `settingsSync`, `windowReportRepo`, `syncStatus`; `shared/src/ipc/schemas.ts` + `bridge.ts` — `forge`, `settings`, `sync` namespaces; [`shared/src/domain/window.ts`](../../../packages/shared/src/domain/window.ts) — `WindowDescriptor.repoId` real; browser tab schema — `state`, `keepAwake` |
| Main — liveness | [`desktop/src/main/fetch-scheduler.ts`](../../../packages/desktop/src/main/fetch-scheduler.ts) *(new)*; [`desktop/src/main/forge/forge-poller.ts`](../../../packages/desktop/src/main/forge/forge-poller.ts) *(new)*; `settings-mirror.ts` *(new)*; [`watch-service.ts`](../../../packages/desktop/src/main/watch-service.ts); [`window-manager.ts`](../../../packages/desktop/src/main/window-manager.ts) — `repoId`, `broadcastToWindowsOnRepo`; `ipc/window-handlers.ts`, new `ipc/forge-poll-handlers.ts` |
| Main — memory | [`browser-service.ts`](../../../packages/desktop/src/main/browser-service.ts) — discard/recreate; [`apps-service.ts`](../../../packages/desktop/src/main/apps-service.ts) — discard exclusion; [`pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts) — replay/subscribe hand-off |
| Renderer — sync | [`detached-root.tsx`](../../../packages/app/src/detached-root.tsx); [`services/watch-invalidation.ts`](../../../packages/app/src/services/watch-invalidation.ts); [`services/broadcast-sync.ts`](../../../packages/app/src/services/broadcast-sync.ts) — delete `relayWatchEvent`; new `services/use-forge-subscription.ts`; [`app.tsx`](../../../packages/app/src/app.tsx) — delete `useAutoFetch`; new `store/liveness-store.ts`; status-bar zone |
| Renderer — memory | [`features/terminal/terminal-panel.tsx`](../../../packages/app/src/features/terminal/terminal-panel.tsx); new `features/terminal/session-mount-policy.ts`; [`xterm-budget.ts`](../../../packages/app/src/features/terminal/xterm-budget.ts); [`features/projects/board/card-terminal.tsx`](../../../packages/app/src/features/projects/board/card-terminal.tsx); [`components/view-registry.tsx`](../../../packages/app/src/components/view-registry.tsx) — `keepAlive`, `cascade`; [`main.tsx`](../../../packages/app/src/main.tsx) — popout diet; browser tab strip — sleeping glyph, Keep awake |
| Renderer — motion | new [`lib/use-cascade-reveal.ts`](../../../packages/app/src/lib/use-cascade-reveal.ts); [`lib/cascade.ts`](../../../packages/app/src/lib/cascade.ts); [`features/graph/graph-view.tsx`](../../../packages/app/src/features/graph/graph-view.tsx); [`features/repos/repos-panel.tsx`](../../../packages/app/src/features/repos/repos-panel.tsx); [`features/files/file-tree.tsx`](../../../packages/app/src/features/files/file-tree.tsx); `components/fab-panel.tsx`; `features/companion/companion-panel.tsx`; [`components/use-reveal.ts`](../../../packages/app/src/components/use-reveal.ts); `styles.css`; `tailwind.config.ts`; [`styles-motion-guards.ts`](../../../packages/app/src/styles-motion-guards.ts) |
| Settings | `Settings ▸ Git` (unchanged fields, new owner), `Settings ▸ Browser` — discard threshold, `Settings ▸ Terminal` — keep-recent count, Apps — discard opt-in |
| Perf | [`scripts/perf/memory-report.mjs`](../../../scripts/perf/memory-report.mjs) — `--popout`; [`scripts/perf/idle-cpu.mjs`](../../../scripts/perf/idle-cpu.mjs) — subprocess assertion; `budgets.json` |
| Tests | `detached-root.test.tsx`, `fetch-scheduler.test.ts`, `forge-poller.test.ts`, `session-mount-policy.test.ts`, `browser-service.test.ts` (discard), `use-cascade-reveal.test.ts`, `styles-motion-guards.test.ts`, one pixel-diff spec |
| Docs | this file; [`.midnite/tasks/_INDEX.md`](../_INDEX.md) |

---

## Verification

- [ ] `moon run :typecheck :lint :test` green across all monorepo packages.
- [ ] **J.1 baseline recorded here before the first theme PR** (RSS idle / +10 sessions / +8 tabs / +1 popout; `idle-cpu --blurred`).
- [ ] A.4's unit test: a `DetachedRoot` page popout invalidates its own `QueryClient` on a `watch.onEvent`; `relayWatchEvent` no longer exists.
- [ ] **Human pass:** detach Graph, commit in the main window → the detached Graph shows the new row with no reload; do the same with Changes and a file save. Repeat with the *popout* focused and the main window behind it.
- [ ] `useAutoFetch` has zero references in `packages/app`; `fetch-scheduler.test.ts`: no visible window → no spawn; first `show` after a pause → exactly one catch-up fetch; a fetch that moved a ref → one `refs` broadcast, one that moved nothing → none.
- [ ] `forge-poller.test.ts`: subscribe starts polling, the last unsubscribe stops it, a window `closed` drops its subscriptions, an unchanged hash emits nothing, a rate-limit response backs off and reports `backoffUntil`.
- [ ] Terminal: with 10 sessions open only 4 xterms are mounted; switching to a disposed session shows a transcript byte-identical to main's ring, with live output continuing with no gap or duplicate line.
- [ ] Browser: a hidden tab past the threshold is discarded (its renderer process gone), shows the sleeping glyph, and reactivates logged-in at the same URL; a Keep-awake tab and an audible tab are never discarded; a Phase 83 app is never discarded by default.
- [ ] Graph → Files → Graph within the TTL shows rows with no re-stream; a watcher event while hidden defers the re-stream to reveal; a 25k-row graph unmounts immediately on leave.
- [ ] Popout RSS for the Graph role is recorded against J.1's baseline and `budgets.json` has the line.
- [ ] Liveness dot: green after an event, amber with reason when the last window is minimized or the poller is backed off, red when the watcher errors; present in a popout.
- [ ] Cascade: under `reduced` a cascading panel's first frame is pixel-identical to its settled frame; a commit in another window updates the graph with **no** cascade; `idle-cpu.mjs` post-settle unchanged from baseline.
- [ ] **Human pass (full motion):** graph, repos panel, explorer, Actions and Issues cascade top-to-bottom on open and on repo switch; terminal, companion and Loops fade on every reveal; nothing shimmers on a save.

---

## Not in this phase

- **A main-side repo state snapshot.** N windows still run N sets of `status`/`refs`/`log` per watch event. Theme D (main knows each window's repo) and B/C (timers in main) are the groundwork; computing once and streaming a snapshot is the next phase's whole job.
- **Monaco slimming and lane pass-through edges** — [Phase 77](phase-77-thirteen-megabytes-of-editor.md), untouched.
- **Changes to the `WebContentsView` engine's security posture or partitioning** — [Phase 32](phase-32-browser-engine-and-tabs.md); F only adds a lifecycle on top.
- **Per-row "new commit slides in" animation on refresh.** The replay rule is mount/reveal/repo-switch only; a per-row diff on virtualized graph rows was weighed and declined as an L for a nicety.
- **Automated two-window verification.** Same precedent as [Phase 55 F.3](phase-55-multi-window-studio.md) and [Phase 83](phase-83-third-party-apps-rail.md): the e2e suite runs against a mocked bridge and cannot launch a real second Electron window, so cross-window liveness is proven by a unit test against the bridge plus a human pass.

---

## Decisions / open questions

- **Resolved — forge polling is interest-based.** Windows register `{repoId, kind}` interest when a forge view mounts; zero subscribers means zero polling. Chosen over "always, for every open repo" to protect API budget and keep the blurred idle profile at zero.
- **Resolved — browser tabs discard Chrome-style, opt-out.** Threshold default 10 min, tunable; sleeping glyph; per-tab Keep awake; audible tabs, active tabs and Phase 83 apps excluded by default.
- **Resolved — heavy views keep alive rather than snapshot.** Last-left Graph/Changes stays mounted `display:none` for a TTL and under a row ceiling — the pattern the terminal-maximized case already proved — over serialising the row buffer, which is more code and needs its own staleness check.
- **Resolved — terminal mount policy is visible + 3 most-recent, dispose after 2 min hidden.** Both numbers are Settings fields.
- **Resolved — the popout diet is in scope**, measured as `popoutRss` with a budget line.
- **Resolved — the sync is observable**: a status-bar liveness dot in every window, backed by a per-window store and a `syncStatus` push from main.
- **Resolved — cascade replay rule: mount, reveal and repo switch, never on data refresh.** Terminal/companion/Loops fade on every reveal. Full motion only; a no-op under `reduced` through an app-owned media rule, not the shell's reset.
- **Open — how main learns renderer-owned settings.** *Recommendation:* the `settingsSync` push channel (B.4) with `ui-store` staying the owner — smaller blast radius than moving four fields to a main-side store, and D.1 already opens a renderer→main report path of the same shape.
- **Open — forge poll cadence.** *Recommendation:* 60 s with exponential back-off to 10 min on rate-limit signals, surfaced as amber on the dot; revisit once C.4 has real `x-ratelimit` numbers from a day's use.
- **Open — restoring navigation history on un-discard.** *Recommendation:* URL-only restore in the first cut; if the pinned Electron's `webContents.navigationHistory` exposes `getAllEntries`/`restore`, add history restore in the same theme, otherwise note it in `outstanding.md`.
- **Open — what a kept-alive hidden view does with invalidations.** *Recommendation:* defer (G.2) — mark stale and re-stream on reveal — rather than re-stream while hidden, which would spend subprocesses on a view nobody sees.
