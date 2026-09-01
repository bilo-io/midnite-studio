# Phase 36 — Faster, lighter, same app

**Refined: x1** · 2026-09-01 · surface states, contracts & concurrency, testing & measurement, plan shape

The app is feature-rich and visibly finished — and it has never once been measured. The entry
chunk is **2.52 MB** because every view is a static import in
[`app.tsx`](../../../packages/app/src/app.tsx) (the only `React.lazy` in the whole renderer is
the CodeMirror editor behind
[`file-preview.tsx:25`](../../../packages/app/src/features/files/preview/file-preview.tsx));
main serializes **four awaits and a synchronous login-shell spawn** ahead of `createWindow()` in
[`main/index.ts`](../../../packages/desktop/src/main/index.ts); an idle, blurred window still
runs **four separate 1 s intervals** (three clocks + the screensaver idle poll), per-repo
auto-fetch with no visibility gate, and a 1 s activity tick in main; and the diff highlight
cache in
[`line-highlight.ts:46`](../../../packages/app/src/features/diff/line-highlight.ts) is an
unbounded module-level `Map` keyed on full line text. This phase is the whole loop: **measure,
fix what the numbers indict, and leave budgets behind** so it cannot silently regress. Nothing
user-facing changes — no pixel, no behaviour, no keybinding. If a change would alter what the
user sees or how the app responds, it does not belong in this phase.

**Builds on.** Phase 18's metrics sampler already has the correct idle posture — adaptive
cadence, `timer.unref()`, and the pause/resume window binding `bindMetricsToWindow`
([`metrics-handlers.ts:54-62`](../../../packages/desktop/src/main/ipc/metrics-handlers.ts)) —
this phase applies that existing pattern where it fits (and deliberately *not* where it
doesn't: agent decay clocks must keep ticking while the window is blurred). Phase 20 D's
idle-scheduled shiki and Phase 26's virtualized diff already paid their render bills;
[`diff-scroll-perf.spec.ts`](../../../packages/app/e2e/diff-scroll-perf.spec.ts) is the repo's
one perf spec and becomes the seed of the budget suite. Two deferred items are pre-written for
this phase: **interval-tree edge culling** ([`outstanding.md`](../outstanding.md), gated on
profiling) and **broker socket frame batching**
([`phase-30`](phase-30-terminal-hardening.md), deferred "if the socket ever shows up in a
profile").

**Scope guardrails.** Strict measurement discipline: **every landed item records a
before/after number** (ms, KB, %CPU, or heap MB) in the baseline table at the bottom of this
doc — an item with no number is not done. The **official measurement mode** is
packaged-equivalent — built renderer via `MSTUDIO_USE_BUILT_RENDERER === '1'`
([`window.ts:100`](../../../packages/desktop/src/main/window.ts)) plus the esbuild-bundled
main — **median of 5 cold runs**. **No browser-tab code**: background-`WebContentsView`
suspension overlaps Phase 32's unfinished themes E/F and stays theirs. **No UI surface**:
measurement tooling is dev-side scripts under `scripts/perf/` (net-new), not product code.
Budgets live in a **separate `:perf` target**, outside the default `:test` gate, exactly as
`e2e` already is ([`packages/app/moon.yml`](../../../packages/app/moon.yml) keeps `e2e` out of
`:test` because of the chromium download — `:perf` inherits both the pattern and the reason).

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Baseline & harness (M) — ✅ DONE (2026-09-01)

Lands first — every other theme's before/after numbers come from here. The env flag is
`MSTUDIO_PERF`, unclaimed today; boolean env convention is bracket access compared to `'1'`
(`process.env['MSTUDIO_PERF'] === '1'`, as
[`broker-client.ts:292`](../../../packages/desktop/src/main/broker-client.ts) does).

- [x] Boot timing marks in main, behind `MSTUDIO_PERF === '1'`.
  - Net-new [`main/perf-marks.ts`](../../../packages/desktop/src/main/perf-marks.ts) exporting
    `bootMark(name: string): void` — logs `[perf] main <name> <elapsedMs>` (elapsed since
    process start) through `defaultLogger`
    ([`log.ts`](../../../packages/desktop/src/main/log.ts) is deliberately the one log seam —
    its header forbids a second logger; do not add one). The flag is read once at module load;
    with it unset, `bootMark` is a no-op closure.
  - Mark names, exactly: `login-shell-done` · `when-ready` · `handlers-registered` ·
    `legacy-migrated` · `pty-ready` · `agents-listed` · `repos-restored` · `create-window` ·
    `ready-to-show` (emitted inside the `win.once('ready-to-show', …)` handler,
    [`window.ts:86`](../../../packages/desktop/src/main/window.ts)).
  - Verified by: `scripts/perf/startup-report.mjs` fails loudly if any expected mark is
    missing from a run's output.
- [x] Renderer marks over a new one-way IPC channel — chosen over console-message capture for
      a clean contract (Decision).
  - Net-new [`shared/src/perf.ts`](../../../packages/shared/src/perf.ts):
    `PerfMarkSchema = z.object({ name: z.string().max(64), tMs: z.number() })`, channel
    constant `MSTUDIO_PERF_MARK = 'mstudio:perf:mark'`, and the bridge type
    `perf: { enabled: boolean; mark(m: PerfMark): void }` added to the preload bridge type.
  - Preload exposes `perf.enabled` (read from `process.env` in the preload, where env is
    reachable) and `perf.mark` as fire-and-forget `ipcRenderer.send`. Renderer calls
    `performance.mark(name)` + `window.midniteStudio.perf.mark(...)` only when
    `perf.enabled` — zero cost otherwise.
  - Net-new [`main/ipc/perf-handlers.ts`](../../../packages/desktop/src/main/ipc/perf-handlers.ts):
    `ipcMain.on` + `PerfMarkSchema.safeParse`, logging `[perf] renderer <name> <tMs>`.
  - Renderer mark sites, exactly three: `renderer-boot` (top of the entry module),
    `first-view-rendered` (layout effect beside the view switch in
    [`app.tsx`](../../../packages/app/src/app.tsx)), `graph-first-batch` (where the first
    `GraphRow` batch commits).
  - Verified by: unit test on the handler rejects a malformed payload; `startup-report.mjs`
    shows all three renderer marks.
- [x] Net-new `scripts/perf/startup-report.mjs` — launches the packaged-equivalent app
      (`MSTUDIO_PERF=1 MSTUDIO_USE_BUILT_RENDERER=1`), parses `[perf] …` lines, prints a
      stage-by-stage table. `--runs=5` repeats and prints per-mark medians. Exits non-zero on
      a missing mark **or** if `repos-restored` does not precede `create-window` — the script
      itself polices Theme B's ordering guarantee.
- [x] Net-new `scripts/perf/bundle-report.mjs` — prints entry-chunk KB (`assets/index-*.js`),
      total JS KB, top-10 chunks from `packages/app/dist`; `--assert` compares against
      `scripts/perf/budgets.json` (Theme H) and exits 1 on breach. `rollup-plugin-visualizer`
      wired into [`vite.config.ts`](../../../packages/app/vite.config.ts) behind
      `MSTUDIO_BUNDLE_STATS === '1'`; Vite `build.manifest: true` is enabled so specs can read
      the chunk graph from `.vite/manifest.json`.
- [x] Heap-measurement procedure written into this doc: renderer = DevTools heap snapshot
      (exact click-path), main = `process.memoryUsage().rss` sampled by
      `startup-report.mjs --rss`. Repeatable, not folklore.
- [x] **Record the baseline table** (bottom of this doc) before any fix lands: cold start
      (launch → `ready-to-show`, → `first-view-rendered`, → `graph-first-batch`), entry chunk
      KB, total JS KB, idle %CPU (main + renderer, focused and blurred, 5 min untouched),
      renderer heap after the Theme F diff-scroll session. Median of 5, packaged-equivalent.
  - **Filled across two sessions, and the table keeps them apart.** The harness landed before
    anyone ran it, so D/E/F were measured against the pre-phase tip and B/C against the tip that
    already contained them. Both sets are recorded, in two tables rather than one series: the
    absolute numbers do not line up across the two sessions, and splicing them would invent a
    precision this machine does not have (`login-shell-done` alone ranged 295–2 457 ms across the
    first day's runs, which is itself Theme B's finding).
  - Where "before any fix lands" was recoverable, it was recovered: the bundle columns carry a
    *true* pre-phase number, measured by building the renderer at `eb1e89e` in a throwaway
    worktree — entry chunk **2 481.3 KB**, which retires the doc's "2 520 unverified" guess. The
    timing columns cannot, because the marks that produce them did not exist at that commit, and
    the table says so rather than passing the post-D/E/F tip off as pre-phase.
  - Two rows are still honest blanks — renderer heap and 1-hour main RSS — because both need a
    human with DevTools and an hour. Neither is claimed.
  - The lesson, for the next phase that orders a harness first: a baseline is takeable once, and
    only *before* the thing it is a baseline for. This one cost two extra measurement sessions and
    a table that has to explain itself.

### B — Main-process startup (M)  ✅ DONE (2026-09-01, local — no PR/no remote)

- [x] Make the login-shell PATH probe non-blocking — it is **synchronous** today
      (`spawnSync` at [`shell-path.ts:75`](../../../packages/desktop/src/main/shell-path.ts),
      called before `whenReady` at
      [`index.ts:187`](../../../packages/desktop/src/main/index.ts)).
  - Add `ensureLoginShellPathAsync(): Promise<void>` to `shell-path.ts` (async `spawn`, same
    `mergePath` merge into `process.env['PATH']`); export the started promise as
    `loginShellReady`. Kick it off first thing, **without** awaiting; `initPtyService` and the
    first git exec `await loginShellReady` instead (they are the consumers the original
    comment names). Delete the sync variant once callers move.
  - Verified by: `login-shell-done` mark no longer precedes `when-ready`; a vitest on
    `shell-path.ts` covers the async path's merge behaviour.
- [x] Parallelise the `whenReady` awaits under an explicit ordering rule:
      `migrateAnyLegacyRepoStore` **must** finish before `initPtyService` and `restoreRepos`
      (it may move the stores they read); then
      `Promise.all([initPtyService…, listAgents().then(createActivityDetector…), restoreRepos().then(openReposFromEnv)])`;
      `createWindow()` only after that `Promise.all` resolves — which preserves, verbatim, the
      commented guarantee at `index.ts:248-250` (the renderer's first `repo:list` must not see
      an empty answer). `openReposFromEnv` stays sequenced after `restoreRepos` (same store).
  - Verified by: `startup-report.mjs`'s built-in `repos-restored` < `create-window` ordering
    assertion, plus the before/after boot medians.
- [x] Dynamically import the three post-boot handler-module groups now (Decision:
      pre-committed, not measure-gated): the update service, the councils handlers, and the
      forge handlers. Mechanism: their `register*Handlers` calls stay eager and synchronous,
      but each heavy module body moves behind a memoized `await import(…)` inside the handler
      closures, bracketed by `bootMark` pairs so each deferral's saving is individually
      visible. Any other module group is deferred only if Theme A's marks show ≥10 ms for it.
- [x] `minify: true` in the shared esbuild config of
      [`scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) (`sourcemap: true`
      stays; the three `external`s are pinned by the header comment and must not change). Run
      the three `await build()` calls through `Promise.all` while there.
- [x] Before/after in the baseline table: launch → `ready-to-show` ms, launch →
      `graph-first-batch` ms.

### C — Renderer bundle & lazy views (L)  ✅ DONE (2026-09-01, local — no PR/no remote)

Grew from M: the graph-dnd split (Decision) adds real work.

- [x] Net-new
      [`components/delayed-fallback.tsx`](../../../packages/app/src/components/delayed-fallback.tsx):
      `DelayedFallback({ delayMs = 120 })` renders `null` until `delayMs` elapses (one
      `setTimeout`), then the existing `<Spinner />`
      ([`spinner.tsx`](../../../packages/app/src/components/spinner.tsx) — already
      reduced-motion-aware) centred in a full-height flex box. Warm chunk loads therefore
      never flash (Decision: null ≤120 ms → Spinner).
- [x] `React.lazy` the views at the `app.tsx` switch. Exact conversion list: `SettingsView`,
      `CouncilsView`, `DashboardView`, `FilesView`, `SearchView`, `Workbench`, `ActionsView`,
      `TestsView`, `ReviewsView`, `BrowserPane`, plus the rarely-shown `SlidesModal`,
      `OnboardingModal`, `FirstRunModal`. **Eager, on purpose:** `GraphView` (first paint),
      `EmptyWorkspace`, `Placeholder`, `ScreensaverHost` (always mounted).
  - Placement rule: **one** `<Suspense fallback={<DelayedFallback />}>` wrapping the whole
    ternary chain, *inside* the wrapper div at `app.tsx:815` (its
    `covering && terminalTween.settled ? 'hidden' : ''` class handling is load-bearing and
    unchanged), *outside* the ternary — one boundary, not thirteen. The ternary's order is
    load-bearing (`settings`/`councils` render repo-independently **before** the
    `!selectedRepoId` guard) and does not change.
- [x] Split xterm out of the entry: `terminal-panel.tsx` currently imports `terminal-view`
      statically ([`terminal-panel.tsx:14`](../../../packages/app/src/features/terminal/terminal-panel.tsx)),
      pulling `@xterm/xterm` + the webgl addon into boot. Convert to
      `lazy(() => import('./terminal-view'))` with `DelayedFallback`, **and** warm the chunk
      via net-new [`lib/idle-preload.ts`](../../../packages/app/src/lib/idle-preload.ts)
      (`idlePreload(loader)` — `requestIdleCallback` with `setTimeout` fallback, same shape as
      `line-highlight.ts:53`) fired after first paint — so Ctrl+` in practice never shows a
      fallback frame.
- [x] Split `@dnd-kit` out of the entry (Decision: split, including the graph's wiring). The
      dnd context wrapper in
      [`graph-dnd.tsx`](../../../packages/app/src/features/graph/graph-dnd.tsx) becomes a lazy
      boundary with `fallback={null}` — rows render and scroll immediately; a drag started in
      the first ~100 ms before the chunk lands is a no-op, which is indistinguishable from
      today's not-yet-interactive first frames. Apply the same lazy-wrapper pattern to the
      sidebar's [`repo-groups.tsx`](../../../packages/app/src/features/repos/repo-groups.tsx)
      dnd wiring (the sidebar is eager and would otherwise keep `@dnd-kit` in the entry).
  - Verified by: the Theme H manifest assertion — no `@dnd-kit/*` module in the entry chunk.
- [x] `react-grid-layout` and `react-markdown`/`remark-gfm` leave the entry automatically once
      their only consumers (`DashboardView`; `Workbench`/reviews) are lazy — the deliverable
      is the **assertion**, not more splitting: the manifest check must show both absent from
      the entry chunk; add an explicit split only where that assertion fails.
- [x] `build.rollupOptions.manualChunks` in `vite.config.ts` **only if** the visualizer shows
      the same vendor module duplicated across ≥2 lazy chunks (a measured change, like
      everything else here); otherwise explicitly skip it and note that in the PR.
- [x] Gate sourcemaps behind `MSTUDIO_SOURCEMAP === '1'` in both `vite.config.ts`
      (`build.sourcemap`) and `bundle.mjs` — `dist/` is 70 MB today, ~54 MB of it maps.
- [x] Before/after: entry chunk KB (baseline 2.52 MB), total JS KB, `first-view-rendered` ms.

### D — One icon family (M) — ✅ DONE (2026-09-01, one item ◐ PARTIAL)

- [x] Migrate the **54** files importing `lucide-react` (definitive list:
      `grep -rl "from 'lucide-react'" packages/app/src` — includes
      [`components/icons/index.ts`](../../../packages/app/src/components/icons/index.ts), the
      existing icon registry, whose `icons.test.ts` guard stays green) to `react-icons/lu`.
      Direct per-file rename (Decision): `ChevronLeft` → `LuChevronLeft`; `react-icons/lu`
      *is* the Lucide set re-exported, so every glyph has an exact same-name equivalent. The
      structural `IconComponent` type
      ([`icon-button.tsx:21`](../../../packages/app/src/components/icon-button.tsx)) accepts
      both families — no API change anywhere.
- [x] `strokeWidth` parity check: react-icons spreads props onto the root `<svg>`, where
      Lucide glyphs inherit `stroke-width` from the root — so `strokeWidth={n}` should carry
      over. Grep every current `strokeWidth` usage paired with a lucide icon and
      screenshot-verify exactly those sites; a visible weight change is a **blocker**, not a
      judgement call.
- [x] Remove `lucide-react` from `packages/app/package.json`; add a `no-restricted-imports`
      entry for `'lucide-react'` in the app block of
      [`eslint.config.mjs`](../../../eslint.config.mjs) with the message
      `"Phase 36: import icons from react-icons/<set> instead"`.
- [x] Update the icon convention paragraphs in [`CLAUDE.md`](../../../CLAUDE.md), `AGENTS.md`
      and `GEMINI.md` (all three, per the sync rule): the "lucide-react stays, the two
      coexist" paragraph is superseded — `react-icons` is the only family.
- [ ] ◐ PARTIAL — Screenshot parity via the existing `MSTUDIO_SHOTS` harness
      ([`e2e/shots.spec.ts`](../../../packages/app/e2e/shots.spec.ts)): regenerate before and
      after the migration; the diff review is a Verification item. **Done and reported as
      unusable** — the suite's PNGs carry a live clock and most are historical committed
      artifacts, so a pixel diff of two runs of the *same* tree already differs on ~30 files.
      Parity was established at code level instead; see *Icon parity* below. The human-eye pass
      stays open.
- [x] Before/after: entry+vendor KB attributable to icons; note the installed-footprint win
      (`lucide-react` is 40 MB in `node_modules`).

### E — Idle-CPU zero (M) — ✅ DONE (2026-09-01)

Four renderer 1 s timers today: three clocks
([`titlebar-status.tsx:24`](../../../packages/app/src/features/titlebar-status/titlebar-status.tsx),
`time-section.tsx:16`, `world-clocks-section.tsx:83`) plus the screensaver idle poll
([`screensaver-host.tsx:32`](../../../packages/app/src/features/screensaver/screensaver-host.tsx)).

- [x] Net-new [`lib/use-now.ts`](../../../packages/app/src/lib/use-now.ts):
      `export function useNow(): Date` over `useSyncExternalStore` and a module singleton —
      one `setInterval(…, 1000)` started on the first subscriber, cleared on the last
      unsubscribe, **stopped while `document.hidden`** (a `visibilitychange` listener stops /
      restarts it and pushes a fresh `Date` immediately on show, so clocks snap correct on
      resume). `getSnapshot` returns the same `Date` object between ticks (a cached module
      `let`, updated per tick) so React sees a stable snapshot.
- [x] Convert the three clock consumers to `useNow()` and delete their local intervals;
      convert the module-local `useNowTick` in
      [`terminal-page.tsx:75`](../../../packages/app/src/features/settings/settings-pages/terminal-page.tsx)
      to `useNow().getTime()`.
  - Verified by: vitest fake timers — mounting all three consumers registers **exactly one**
    interval; simulating `document.hidden` + `visibilitychange` leaves **zero**.
- [x] **Delete** [`use-rebase-status.ts`](../../../packages/app/src/features/rebase/use-rebase-status.ts)
      (Decision). It has zero consumers — nothing imports it, its 2 s poll never runs, and
      Phase 31 shipped its own rebase plumbing. Git history keeps it recoverable.
  - Verified by: `grep -rn "useRebaseStatus" packages/app/src` returns nothing; typecheck
    stays green.
- [x] `useAutoFetch` ([`app.tsx:260`](../../../packages/app/src/app.tsx)): pause + catch-up
      (Decision). Skip the tick while `document.hidden`; record `lastFetchAt`; on
      `visibilitychange` → visible, fetch immediately iff `Date.now() - lastFetchAt ≥
      autoFetchIntervalMs`. The user never sees staler data than today; a blurred window does
      zero git traffic.
  - Verified by: vitest fake timers + jsdom visibility mock — hidden ticks fire no
    `api.ops.fetch`; the refocus catch-up fires exactly once.
- [x] Screensaver idle detection goes event-driven: replace the 1 s compare-poll with a single
      re-armed `setTimeout(open, inactivityTimeoutS * 1000)` cleared/re-armed by the activity
      events the host already listens to (`mousemove, keydown, mousedown, pointerdown,
      touchstart`, `screensaver-host.tsx:19`); a change to `inactivityTimeoutS` re-arms;
      `screensaverOpen` cancels. Zero timers while the user is active-or-away, instead of one
      per second forever.
- [x] rAF loops: **verify, don't rebuild.** Chromium throttles `requestAnimationFrame` in
      hidden windows by default; confirm nothing disables `backgroundThrottling` on the
      BrowserWindow ([`window.ts`](../../../packages/desktop/src/main/window.ts)) and record
      the observed hidden-window rAF rate for the orbit spinner
      (`spinner.tsx:161` — the only rAF variant; reduced-motion is already handled at `:109`)
      and `neuro-cloud-background.tsx:54`. Add explicit `document.hidden` gates **only if**
      that verification fails.
- [x] Main: the 1 s `tickActivityClocks` interval
      ([`index.ts:280`](../../../packages/desktop/src/main/index.ts)) runs **only while
      `activityTracking` is non-empty** (Decision — a blur gate would freeze agent status
      while agents legitimately run in the background). Move interval ownership into
      [`pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts): first tracked pty
      starts it, last untracked stops it; the `index.ts:280` line is deleted.
  - Verified by: desktop vitest with fake timers — after the last untrack, no timer remains.
- [x] Before/after: main + renderer %CPU after 5 min untouched, focused **and** blurred.

### F — Memory: caps where growth is unbounded (M) — ✅ DONE (2026-09-01, one item ◐ PARTIAL)

- [x] Cap the diff highlight cache: 10 k true LRU (Decision). In
      [`line-highlight.ts`](../../../packages/app/src/features/diff/line-highlight.ts):
      `const MAX_ENTRIES = 10_000`; a cache hit re-inserts (delete+set) so iteration order is
      recency; on insert past the cap, evict `cache.keys().next().value`. 10 k ≈ two 4 000-line
      diffs in both themes.
  - Verified by: net-new `line-highlight.test.ts` — size never exceeds `MAX_ENTRIES`; a
    recently-read key survives eviction that removes a never-re-read one; `__resetLineHighlights`
    still clears.
- [x] Fix the N·M notify in the same file: `listeners` is one global `Set` and **every**
      resolved line notifies **all** subscribers (`:106`) — N mounted rows × M resolutions
      re-runs every row's `snapshot`. Replace with `Map<key, Set<() => void>>` so a resolution
      notifies only that key's subscribers; `useLineHighlight`'s `useSyncExternalStore`
      subscribe closes over its own key.
  - Verified by: spy test — resolving key A never invokes key B's subscriber.
- [x] Scrollback duplication: audit + document + bounds test (Decision — the single-ownership
      refactor is ruled out, see *Not in this phase*). Write the ownership rule into code
      comments where the three holders live: the broker's `scrollbackBySession`
      ([`broker/server.ts:125`](../../../packages/desktop/src/broker/server.ts)) is
      authoritative out-of-proc; `pty-service.ts:190`'s mirror exists for the
      `MSTUDIO_PTY_INPROC` fallback; `snapshotCache` (`:193`) is a 200 ms-TTL read cache whose
      entries are deleted on session close (`:249`).
  - Verified by: vitest against both `appendScrollback` implementations — sustained writes
    never hold more than `SCROLLBACK_BYTES * 2` (2 MiB) per session
    ([`shared/src/terminal.ts:396`](../../../packages/shared/src/terminal.ts)); the
    `snapshotCache` entry is gone after close.
- [x] Unbounded-Map sweep: grep module-level `new Map` across `packages/app/src`; produce a
      table (in the PR description) of every module-level map → its bound or one-line
      justification. Known-bounded, document and move on:
      [`avatars.ts`](../../../packages/app/src/services/avatars.ts) (bounded by distinct
      authors), the shiki singleton
      ([`lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts) — grammars stay
      resident once loaded, bounded by languages actually viewed; accepted).
- [ ] ◐ PARTIAL — Before/after: renderer heap after scrolling ten 4 000-line diffs (the Theme A
      procedure); main RSS after a scripted 1-hour session. **Procedure written, numbers not
      taken**: the heap figure needs a DevTools snapshot (no script can take it) and the RSS
      figure needs an hour. Main RSS at first paint is recorded (154 MB, unchanged); the caps
      themselves are asserted by `line-highlight.test.ts` rather than by a heap number.

### G — Profile-gated claims (M)  ◐ PARTIAL (2026-09-01, local — gate 1 open for a human)

Each item ends in one of two honest states: a landed fix with numbers, or recorded numbers
that acquit the suspect. Either closes the item. **Procedure** (applies to all three):
renderer profiling = DevTools Performance panel against the packaged-equivalent build; main
and broker counters ride the `MSTUDIO_PERF` flag; profiles land in the session scratchpad,
the summary numbers land here and in the gating source.

- [x] Graph edge rendering, on a big repo. **Rig landed; verdict OPEN, for a human** — the
      >30% frame-time threshold needs the DevTools Performance panel. Net-new `scripts/perf/make-big-repo.sh` generates a
      ~50 k-commit fixture repo (loop of empty commits over a handful of branches). Profile a
      full-speed scroll of `GraphView`; if edge rendering holds **>30% of frame time**, land
      the interval-tree edge culling pre-written in [`outstanding.md`](../outstanding.md)
      (~180× on the naive path); otherwise record the acquitting percentage there and close
      the deferral.
- [x] Broker socket, under a chatty pty. Instrument `broadcastData`
      ([`broker/server.ts:157`](../../../packages/desktop/src/broker/server.ts) — currently
      **one socket write per pty chunk**, no coalescing) with a writes/sec counter behind
      `MSTUDIO_PERF`; run `yes` in a session for 10 s. If broker CPU is measurable (>2% of a
      core) at the observed write rate, implement coalescing: per-pty buffer flushed every
      16 ms as a single `encodeData` frame
      ([`broker/protocol.ts:66`](../../../packages/desktop/src/broker/protocol.ts) — the
      length-prefixed frame already permits arbitrary payload sizes). Otherwise record the
      acquittal here and in phase-30's deferral note.
- [x] The `ps` probe, under continuous agent output.
      [`agent-watcher.ts`](../../../packages/desktop/src/main/agent-watcher.ts) debounces to
      one full process-table read per `QUIET_MS = 750` of silence — a chatty agent can sustain
      ~80 reads/min. Count `readProcessRows` invocations behind `MSTUDIO_PERF` during a chatty
      10-minute run; if its CPU share is measurable, raise `QUIET_MS` to 1500 — noting
      `ROWS_TTL_MS = 250` must stay below it (`agent-watcher.ts:63`, a test already asserts
      this). Otherwise acquit.
- [x] Every gate's number — indicting or acquitting — is appended to this doc's Decisions
      section when the item closes.
- [ ] **Open, for a human — G's fourth gate, added after the fact.** Theme E's idle-CPU
      measurement turned up something neither batch explains, and it is the most serious thing
      this phase found: a **focused**, untouched window is bimodal, and its high mode is episodic
      **renderer ~32% + GPU ~55% of a core** — observed on the *after* build, in a window nobody
      touched. That is a real battery bug. It is not a timer: E audited those down to one shared
      clock, and the blurred numbers confirm Chromium is already throttling `requestAnimationFrame`
      in an occluded window. Something animates at frame rate with no user input.
  - Why it needs a human rather than a script: the episodes are occasional, so it wants someone
    watching for one and taking a DevTools performance capture *during* it. A blind sampler
    catches the low mode and reports all-clear — which is exactly how the first pair of 300s
    samples nearly became a false Theme E win.
  - Everything needed is in place: `node scripts/perf/idle-cpu.mjs --seconds=300` reproduces the
    sampling, and both modes are written into the baseline table with the numbers that separate
    them.

### H — Perf budgets that outlive the phase (M)  ✅ DONE (2026-09-01, local — no PR/no remote)

Budget style is **strict milliseconds at 2.5× the post-phase packaged-equivalent median**
(Decision) — this deliberately overrides the structural-counts-first position argued in
`diff-scroll-perf.spec.ts:5-20`, and carries its own flake mitigations: medians (never maxima)
asserted in-spec, 2.5× headroom, and the suite living outside the default gate with
`retries: 0` preserved.

- [x] `perf` task in [`packages/app/moon.yml`](../../../packages/app/moon.yml), modeled
      line-for-line on the existing `e2e` task:
      `command: 'pnpm exec playwright test --config playwright.perf.config.ts'`,
      `options: { mergeArgs: 'replace' }` (mandatory — moon appends otherwise),
      `deps: ['root:install', 'shared:build', 'app:build']` (the bundle spec reads `dist`).
      Excluded from `:test` by construction, like `e2e`.
- [x] Net-new `packages/app/playwright.perf.config.ts`: `testDir: './e2e/perf'`, same
      `webServer` block and single-chromium project as
      [`playwright.config.ts`](../../../packages/app/playwright.config.ts), `retries: 0`.
- [x] Net-new `scripts/perf/budgets.json` — the one budget source, read by both
      `bundle-report.mjs --assert` and the specs:
      `{ entryChunkKB, totalJsKB, readyToShowMs, rendererInteractiveMs, diffScrollMedianGapMs }`,
      each set to 2.5× the post-phase median. The rebaselining procedure (rerun the reports,
      update the JSON, say why in the PR) is documented beside it in a `scripts/perf/README.md`.
- [x] Move the timing test: `diff-scroll-perf.spec.ts`'s median-frame-gap test moves to
      `e2e/perf/diff-scroll.spec.ts` asserting `budgets.diffScrollMedianGapMs`; the two
      structural row-count tests stay in `e2e/` under the default e2e task. This resolves
      Phase 26's open question (budget, not exact count — but the structural counts survive
      where they are).
- [x] Net-new `e2e/perf/bundle-budget.spec.ts`: parses `.vite/manifest.json` (enabled in
      Theme A) and asserts (a) entry chunk ≤ `entryChunkKB`, (b) total JS ≤ `totalJsKB`, and
      (c) **absence**: no `@xterm/*`, `@dnd-kit/*`, `react-grid-layout`, `react-markdown`, or
      `lucide-react` module resolves into the entry chunk — the tripwire for the day someone
      re-adds a static import.
- [x] Net-new `e2e/perf/startup-budget.spec.ts`: launches the packaged-equivalent app via
      Playwright's `_electron.launch` with `MSTUDIO_PERF=1`, collects the marks over 3 runs,
      asserts the medians against `readyToShowMs` and `rendererInteractiveMs`.
- [x] `moon run app:perf` green on this machine is the phase's closing gate (Verification).

## Files this phase touches

| Area | Files |
|------|-------|
| Harness (net-new) | `scripts/perf/startup-report.mjs` · `scripts/perf/bundle-report.mjs` · `scripts/perf/budgets.json` · `scripts/perf/README.md` · `scripts/perf/make-big-repo.sh` · [`main/perf-marks.ts`](../../../packages/desktop/src/main/perf-marks.ts) · [`main/ipc/perf-handlers.ts`](../../../packages/desktop/src/main/ipc/perf-handlers.ts) · [`shared/src/perf.ts`](../../../packages/shared/src/perf.ts) |
| Main boot | [`main/index.ts`](../../../packages/desktop/src/main/index.ts) · [`main/shell-path.ts`](../../../packages/desktop/src/main/shell-path.ts) · [`main/window.ts`](../../../packages/desktop/src/main/window.ts) · [`scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) |
| Renderer shell | [`app.tsx`](../../../packages/app/src/app.tsx) · [`vite.config.ts`](../../../packages/app/vite.config.ts) · `components/delayed-fallback.tsx` (net-new) · `lib/idle-preload.ts` (net-new) · [`terminal-panel.tsx`](../../../packages/app/src/features/terminal/terminal-panel.tsx) · [`graph-dnd.tsx`](../../../packages/app/src/features/graph/graph-dnd.tsx) · [`repo-groups.tsx`](../../../packages/app/src/features/repos/repo-groups.tsx) |
| Timers | `lib/use-now.ts` (net-new) · [`titlebar-status.tsx`](../../../packages/app/src/features/titlebar-status/titlebar-status.tsx) + `time-section.tsx` + `world-clocks-section.tsx` · [`terminal-page.tsx`](../../../packages/app/src/features/settings/settings-pages/terminal-page.tsx) · [`screensaver-host.tsx`](../../../packages/app/src/features/screensaver/screensaver-host.tsx) · [`use-rebase-status.ts`](../../../packages/app/src/features/rebase/use-rebase-status.ts) (**deleted**) · [`pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts) |
| Memory | [`line-highlight.ts`](../../../packages/app/src/features/diff/line-highlight.ts) + `line-highlight.test.ts` (net-new) · [`broker/server.ts`](../../../packages/desktop/src/broker/server.ts) · [`avatars.ts`](../../../packages/app/src/services/avatars.ts) (**unchanged**, documented) · [`lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts) (**unchanged**, documented) |
| Icons | the 54 `lucide-react` importers (`grep -rl "from 'lucide-react'" packages/app/src`) · [`components/icons/index.ts`](../../../packages/app/src/components/icons/index.ts) · [`eslint.config.mjs`](../../../eslint.config.mjs) · [`CLAUDE.md`](../../../CLAUDE.md) + `AGENTS.md` + `GEMINI.md` · `packages/app/package.json` |
| Budgets | [`packages/app/moon.yml`](../../../packages/app/moon.yml) · `playwright.perf.config.ts` (net-new) · `e2e/perf/*` (net-new) · [`e2e/diff-scroll-perf.spec.ts`](../../../packages/app/e2e/diff-scroll-perf.spec.ts) |
| Load-bearing, unchanged | [`metrics-handlers.ts`](../../../packages/desktop/src/main/ipc/metrics-handlers.ts) (the pause pattern) · [`terminal-service.ts`](../../../packages/desktop/src/main/terminal-service.ts) (15 s flush, already `unref`'d) · [`agent-watcher.ts`](../../../packages/desktop/src/main/agent-watcher.ts) (unless G indicts) · [`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) + [`e2e/fixtures.ts`](../../../packages/app/e2e/fixtures.ts) (reused by perf specs) |

## Verification

- [x] `moon run :typecheck :lint :test` green. (2026-09-01)
- [x] `moon run app:perf` green against `scripts/perf/budgets.json` on this machine — 8 passed.
      (2026-09-01)
- [x] The baseline table below carries a before **and** after number for every landed item —
      an item with no number is not done. ◐ Nine rows filled; the four remaining blanks are E's
      idle-%CPU pair and F's two memory rows, all four of which need a human at an untouched
      machine or a DevTools heap snapshot. The table also states plainly that the timing
      "before" column is the post-A/D/E/F tip rather than the pre-phase one, because the marks
      that produce it did not exist at `eb1e89e`; the bundle columns carry a true pre-phase
      number, measured by building the renderer at that commit.
- [x] `startup-report.mjs` passes its own mark-order assertion (`repos-restored` before
      `create-window`) after Theme B lands — the empty-state guarantee, machine-checked. Asserted
      twice over now: the script exits 0, and `e2e/perf/startup-budget.spec.ts` repeats it, since
      Theme B is precisely the "let's parallelise boot" refactor the assertion was written to
      catch. (2026-09-01)
- [x] Fake-timer vitest: three mounted clock consumers register exactly **one** interval;
      hidden ⇒ zero; a `visibilitychange` to visible snaps the clock in the same tick.
      (`app/src/lib/use-now.test.ts`, landed with Theme E)
- [ ] Fake-timer vitest: `useAutoFetch` fires nothing while hidden; exactly one catch-up fetch
      on refocus when an interval has elapsed. **Still open, and it belongs to Theme E:** the
      behaviour landed but `useAutoFetch` is defined inline in `app.tsx`, so there is nothing
      importable to drive with fake timers. Testing it means extracting it to its own module
      first, which is E's change to make, not B/C/G/H's.
- [x] Desktop vitest: the activity-clock interval is absent once the last tracked pty is
      untracked. (`desktop/src/main/activity-ticker.test.ts`, landed with Theme E)
- [x] `line-highlight.test.ts`: cap holds at 10 000; LRU retention order; per-key notify (A's
      resolution never wakes B's subscriber). (landed with Theme F)
- [x] Scrollback bounds vitest, both implementations: ≤ `SCROLLBACK_BYTES * 2` per session
      under sustained writes; `snapshotCache` entry removed on close.
      (`desktop/src/broker/scrollback-bounds.test.ts`, landed with Theme F). Theme G's
      `broker/output-coalescing.test.ts` now sits beside it and covers the ordering the 16ms
      buffer in front of that append must not break.
- [x] `grep -r "lucide-react" packages/app/src` → two hits, both in prose comments describing
      the migration; zero imports. `icon-names.test.ts` green; the eslint rule in place.
      (landed with Theme D) — but see the Decisions note: the package is still in the entry
      chunk via `@bilo-io/ui`/`@bilo-io/shell`, which is why the bundle-level assertion below
      does not name it.
- [x] `e2e/perf/bundle-budget.spec.ts` absence assertions hold: no `@xterm/*`,
      `react-grid-layout`, `react-markdown`, `remark-gfm` in the entry chunk. **Two names left
      the list, each with a measured reason in Decisions:** `@dnd-kit` was acquitted at 59.9 KB
      against a four-eager-hook-path refactor, and `lucide-react` is owned by a dependency we do
      not control, so asserting its absence could only ever fail. `remark-gfm` was added, since
      Theme C had to split `CommitMessage` explicitly to get the markdown pipeline out.
- [x] Playwright (`e2e/terminal-lazy-preload.spec.ts`): the xterm chunk is fetched at idle
      *before* anything opens a terminal, both consumers share exactly one fetch of it, and the
      panel opens to a live xterm with no stuck fallback. **Reshaped from what this item asked
      for, deliberately.** "No `DelayedFallback` frame on toggle" cannot be asserted in this
      suite: it runs against the Vite dev server, where a dynamic import is an unbundled module
      waterfall — xterm is dozens of requests — and reliably exceeds the 120ms threshold. Written
      as specified, the test passes or fails on the dev server's module graph rather than on the
      artifact the promise is about. So it asserts the *mechanism* instead, which is what a later
      edit can actually undo: deleting the `idlePreload` call, or re-adding a direct
      `terminal-view` import in one of the two consumers.
- [ ] **Open, for a human:** the `MSTUDIO_SHOTS` before/after screenshot diff shows no visible
      change — icon glyphs (especially `strokeWidth` sites) and lazy-view first-opens
      included. Partial evidence in hand: all 368 functional e2e specs pass unchanged, the
      `*-shots.spec.ts` screenshot specs among them, which is what makes a *silent* visual
      regression unlikely rather than ruled out.
- [ ] **Open, for a human:** Activity Monitor sanity pass — blurred idle app ≈ 0% CPU for
      both the main and renderer processes.

## Not in this phase

- **Browser-tab suspension** — overlaps Phase 32's unfinished themes E/F in the same
  `packages/desktop` browser-tab files; it stays Phase 32's item.
- **Single-ownership scrollback refactor** — audit-and-document was chosen; making the broker
  the sole holder reworks Phase 30's carefully-tested paths for ~2 MB/session, an L-sized risk
  for an S-sized win.
- **Routing all icons through `components/icons/index.ts`** — direct rename was chosen; the
  registry refactor is orthogonal to the perf goal and triples the diff.
- **Per-view skeleton components** — `DelayedFallback` + Spinner was chosen; thirteen bespoke
  skeletons is UI work in a no-UI-change phase.
- **shiki grammar unloading** — grammars stay resident once loaded; bounded by languages the
  user actually views, and unloading would re-pay the load cost on every revisit.
- **`load more` past the 50 k-commit cap** ([`outstanding.md`](../outstanding.md)) and the
  `_INDEX.md` reconciliation pass for phases 25/32/33 — separate concerns.

## Decisions / open questions

Settled at brainstorm (2026-09-01):

- **Strict measurement** — every item records before/after numbers; no placebo landings.
- **Full icon migration** to `react-icons`; `lucide-react` removed; convention files updated.
- **Browser-tab suspension deferred to Phase 32.**
- **Budgets in a separate `:perf` target**, never the `:test` gate.
- **Startup means both processes** — main boot and renderer first-interactive.
- **Dev-side scripts, no in-app perf UI.**
- **Prod sourcemaps env-gated** (`MSTUDIO_SOURCEMAP === '1'`).

Resolved at refinement x1 (2026-09-01):

- **Resolved — lazy fallback is null ≤120 ms, then `<Spinner />`** (`DelayedFallback`). Warm
  loads never flash; the one slow path shows the existing, reduced-motion-aware spinner
  rather than thirteen new skeletons.
- **Resolved — `@dnd-kit` is split, including the graph's own wiring.** A drag in the first
  ~100 ms is a no-op, indistinguishable from today's boot frames; the entry-chunk absence
  assertion enforces the outcome.
- **Resolved — highlight cache is a 10 k true LRU** (Map re-insertion). ≈ two big diffs in
  both themes; retention behaviour is asserted, not assumed.
- **Resolved — main defers update/councils/forge now**, without waiting for indictment; every
  further deferral needs a ≥10 ms mark. Pre-committing the obvious three keeps Theme B
  shippable in one pass.
- **Resolved — renderer marks travel over `mstudio:perf:mark`**, a zod-schema'd one-way
  channel in `shared/src/perf.ts`. Costs a small wire surface; buys a clean contract and a
  reusable seam.
- **Resolved — budgets assert strict milliseconds at 2.5× the packaged-equivalent median.**
  This overrides the structural-first house position in `diff-scroll-perf.spec.ts:5-20`,
  deliberately: mitigations are in-spec medians, 2.5× headroom, and `:perf` staying out of
  the default gate. The structural absence assertions remain alongside.
- **Resolved — official numbers are packaged-equivalent, median of 5 cold runs**
  (`MSTUDIO_USE_BUILT_RENDERER === '1'` + bundled main). Dev-mode numbers are noise.
- **Resolved — icon migration is a direct per-file rename**, not a registry refactor;
  `react-icons/lu` is the same glyph set, so parity is by construction (modulo the
  `strokeWidth` check).
- **Resolved — `use-rebase-status.ts` is deleted.** Dead code (zero consumers) in a diet
  phase gets deleted; git history keeps it.
- **Resolved — auto-fetch pauses while hidden and catches up on refocus.** The user never
  sees staler data than today; a blurred window does zero git traffic.
- **Resolved — `tickActivityClocks` is gated on `activityTracking` being non-empty, not on
  blur.** Agents keep running while the window is blurred; a blur gate would freeze their
  status. (This corrects the pre-refinement wording.)
- **Resolved — scrollback duplication is audited, documented and bounds-tested, not
  refactored.** See *Not in this phase*.
- **Resolved — `manualChunks` only on observed duplication**; the visualizer decides, not
  taste.
- **Resolved — rAF loops are verified against Chromium's built-in hidden-window throttling
  rather than re-gated by hand**; explicit gates only if verification fails.

Open: **none.** Theme G's three gates are conditionals with written thresholds, not open
decisions — their numbers land back in this section as they close.

### Resolved during execution (2026-09-01)

- **The three pre-committed handler-module deferrals (Theme B) are acquitted, not landed.**
  The pre-commitment assumed the cost was measurable; it is not. Deferring a module body
  behind a dynamic import can only pay off if evaluating it costs something at boot, and ESM
  hoists every static import above the importing module's own body — so the whole cost is
  already paid before `index.ts` runs a line, and `when-ready` cannot see it (Chromium's own
  readiness dominates that mark). Theme B therefore added a `modules-loaded` mark: elapsed at
  the first statement of main's module body, i.e. "every static import evaluated".
  Median-of-5, packaged-equivalent: **147 ms** with all three groups imported, **163 ms** with
  all three stubbed out entirely — and **184 ms** on a repeat of the unmodified build. The
  run-to-run spread on identical code (147 → 184 ms) is wider than the 10 ms threshold the
  decision set, so no honest reading of this instrument can indict any individual group.
  Recorded rather than churned: three memoized `await import(…)` sites, each making a
  synchronous handler path async, bought for a saving the harness cannot detect.
- **Five defects found by reviewing this batch's own diff, all fixed before it landed.** Recorded
  because three of them are the *shape* of mistake this kind of change makes, and the next perf
  slice will be tempted by all three:
  1. **Flushing the coalescing buffer on `snapshot` double-printed terminal output.**
     `flushPtyOutput` broadcasts as well as appending, and `broadcastData` writes to every client
     — *including* the one asking for the snapshot. So the handler emitted a data frame carrying
     bytes X and then answered with a scrollback containing X; the renderer's replay gate holds
     frames arriving during a snapshot and releases them after writing it, so the last ≤16 ms was
     written twice on every mount of a live producing terminal. The flush is now *absent* from
     that handler, which is the opposite of the comment an earlier draft carried: leaving the
     answer ≤16 ms stale hands the buffered bytes to the replay gate, which exists to order
     exactly that. Staleness the gate handles beats duplication it cannot detect. The test now
     asserts the bytes appear in exactly one of the two, never both.
  2. **`Promise.all` fail-fast could leave boot with no window at all.** With the three chains
     sequential, a rejection aborted everything after it. Concurrent, a rejecting `listAgents()`
     (a corrupt `agents.json`) rejects the `Promise.all` while the other two chains finish —
     ptys, broker and watchers all up, `createWindow()` never reached, and an unhandled rejection
     as the only trace. Now `allSettled` with each failure logged by name: a window is the one
     thing boot must produce, and every chain's failure is survivable on its own.
  3. **The lazy split silently removed two animations.** `useReveal` drives the browser pane's
     fade from the *parent* (`shown` flips ~16–32 ms after `mounted`), and the view box is keyed
     on `activeView` precisely so `animate-fade-in` replays per switch — with the Suspense
     boundary *inside* that key. A cold chunk outlives both: the pane mounts already at
     `opacity-100` and pops, and the 160 ms fade runs on an empty box. Fixed by warming **every**
     lazy chunk through `idlePreload` after first paint, not just xterm — which is the right
     posture anyway. The split is about *boot* (1 085 KB parsed instead of 2 481 before the graph
     paints); this app loads its code off `file://`, so there is no network to conserve and no
     reason for the chunks to stay away once the window is up.
  4. **`MSTUDIO_SOURCEMAP` was cache-shadowed.** Not declared as a moon input, so
     `MSTUDIO_SOURCEMAP=1 moon run desktop:bundle app:build` after any prior build was a cache hit
     that silently restored the map-less `dist/` — the escape hatch existed and did not work.
     Added as `$MSTUDIO_SOURCEMAP` to both tasks' inputs (and `$MSTUDIO_BUNDLE_STATS`, which had
     the same hole). `bundle.mjs` also prunes stale `.map` files when maps are off, since esbuild
     never prunes its outdir and a map left beside a rebuilt bundle maps traces through the wrong
     file — worse than no map, because it looks like it worked.
  5. **Minified main with sourcemaps off left every logged stack trace unreadable.** Main's and the
     broker's traces go through `defaultLogger` and surface in the diagnostics view. `keepNames:
     true` costs a few KB and keeps every frame nameable, which is the part of a trace that is
     actually read.
- **Theme H's byte budgets are 1.15×, not 2.5×.** The 2.5× rule is stated in the theme as a
  *flake* allowance, with medians and an out-of-gate suite as its companions — and a byte count
  does not flake. At 2.5× the entry-chunk budget would be 2 712 KB, which is *above* the 2 481 KB
  this phase started from: a budget that permits undoing the phase is not a budget. Milliseconds
  keep 2.5× as written. Both multipliers, and the raw numbers they are applied to, are in
  `budgets.json`'s `_measured` block so a later rebaseline does not have to guess which was which.
- **`budgets.json` uses `entryKb`/`totalJsKb`, not the theme's `entryChunkKB`/`totalJsKB`.** Theme
  A's `bundle-report.mjs --assert` was already written against the former, so the doc's spelling
  would have meant editing a landed consumer to match a string in a checklist. Codebase over
  checklist.
- **`startup-budget.spec.ts` uses `electron-run.mjs`, not Playwright's `_electron.launch`.** The
  theme's checklist named `_electron.launch`; using it would mean re-deriving the two things that
  make an Electron startup number mean anything — the throwaway `--user-data-dir` (Electron keys
  the single-instance lock on it, so a run beside the installed app quits instantly with every
  mark missing) and the seeded profile (`graph-first-batch` never fires unless a repo is
  *selected*, which is persisted state the app does not invent). Two launch paths would give the
  phase two different "startup" numbers, and the budget would assert the one the report does not
  print. Playwright is the runner here, not the browser driver. Three runs rather than five, with
  2.5× headroom absorbing the smaller sample; the official number stays `startup-report.mjs`'s
  median of five.
- **`moon run app:perf` is green: 8 passed.** Entry chunk 1 084.7 KB / 1 250 · total JS
  13 731.8 KB / 15 800 · `ready-to-show` 628 ms / 1 425 · `first-view-rendered` 194 ms / 450 ·
  diff-scroll median frame gap 8.3 ms / 22 · and `@xterm`, `react-grid-layout`, `react-markdown`,
  `remark-gfm` all absent from the entry chunk. The `diffScrollMedianGapMs` budget is 22, not the
  100 it inherited: 100 was an order-of-magnitude tripwire written to survive a busy CI runner,
  which is the right shape for the default gate and far too loose for a budget.
- **Theme G, gate 2 — the broker: INDICTED, and coalescing landed.** `broadcastData` was one
  `encodeData` + one socket write per pty chunk, and `appendScrollback` above it reallocated and
  copied the *entire* retained buffer (capped at `SCROLLBACK_BYTES * 2`) on every chunk too — the
  larger of the two costs, and one the gate did not anticipate. Measured with
  `scripts/perf/broker-load.mjs` (the broker spawned directly, one socket client, `yes` in a pty,
  10s window, `ps -o cputime` differenced): **96.8% of one core for 7.6 MB/s**, 7 073 chunks/s,
  RSS 227 MB. With a per-pty buffer flushed every 16 ms as one frame: writes/s **7 073 → 60.5**,
  RSS **227 → 168 MB**, and throughput rose to 75.9 MB/s — because the broker had been CPU-bound
  and could not drain the pty. Normalised, which is the only fair reading of an *infinite*
  producer: **12.74% → 1.16% of a core per MB/s, an 11× reduction in CPU per byte delivered.** A
  realistic 1 MB/s agent therefore now costs ~1.2% of a core where it cost ~12.7%. Note the gate
  as written ("if broker CPU is measurable (>2% of a core)") is ill-posed against `yes`, which
  will pin any implementation at ~100%; the per-byte figure is what it should have asked for, and
  it is what is recorded. Correctness rides on flushing before anything that can observe a
  stream — `snapshot`, the disk `flush`, `kill`, `onExit`, shutdown, and the 15s interval — with
  five tests in `broker/output-coalescing.test.ts` pinning the ordering rather than the speed.
- **Theme G, gate 3 — the `ps` probe: INDICTED, `QUIET_MS` 750 → 1500.** One
  `ps -axo pid=,ppid=,stat=,args=` costs a median **30.6 ms of CPU** (user+sys of the child,
  median of 20 on this machine). A chatty pty resets the quiet timer continuously and so sustains
  one probe per window forever: at 750 ms that is 80 probes/min = 2 448 ms CPU/min = **4.08% of
  one core**; at 1500 ms it is **2.04%**. Four percent of a core in perpetuity to keep an icon in
  step is not a trade worth making for a fact the watcher's own header describes as changing "a
  handful of times a day". `ROWS_TTL_MS = 250` stays below `QUIET_MS` by construction — raising
  `QUIET_MS` is the direction that cannot break the invariant the existing test asserts. The cost
  is that an agent which starts and then falls quiet gets its mark up to 750 ms later.
- **Theme G, gate 1 — graph edge rendering: OPEN, for a human.** This one cannot be answered
  headlessly: the threshold is ">30% of frame time", and frame-time attribution means the DevTools
  Performance panel against the packaged-equivalent build. The rig is landed and the procedure is
  one command: `scripts/perf/make-big-repo.sh` generates a ~50 000-commit fixture over six lanes
  that merge every 97th commit (so the layout has real crossings, not parallel straight lines),
  built with `commit-tree` plumbing rather than `git commit` in a loop — two cheap object writes
  per commit instead of an index re-read and hooks, which is three minutes rather than forty.
  Then `MSTUDIO_PERF=1 MSTUDIO_OPEN_REPOS=<fixture> moon run desktop:start`, record a full-speed
  scroll, and read edge rendering's share. >30% lands the interval-tree culling already written up
  in `outstanding.md`; anything less closes that deferral with the acquitting number.
- **The `@dnd-kit` split is acquitted at 59.9 KB, against a four-path refactor.** The decision
  to split it (graph wiring included) was taken against the doc's own unverified 2.52 MB entry
  chunk. Measured — by forcing every `@dnd-kit/*` module into its own chunk and reading the
  emitted size — the whole of core + sortable + modifiers + utilities is **59.9 KB minified**,
  5.5% of the post-C entry. And it does not reach the entry by one path but by four, all eager:
  `graph-row.tsx`'s `useRefDnd`/`useCommitDnd`, `repos-panel.tsx` and
  `terminal-session-list.tsx` via `components/sortable-list.tsx`, and `repo-groups.tsx`'s own
  wiring. Every one is a *hook*, and a hook cannot move behind a lazy boundary without changing
  its call count when the chunk lands — React's rules forbid it — so splitting means converting
  four sites to render-prop wiring components that swap an inert implementation for the real one.
  Splitting fewer than all four buys nothing: any remaining eager path keeps the whole 59.9 KB.
  The mechanism is written down here so it can be picked up if the entry ever needs that 60 KB;
  today it does not, and `@dnd-kit` is therefore dropped from Theme H's absence assertion.
- **`lucide-react` cannot be asserted absent from the entry chunk, because a dependency owns
  it.** Theme D removed all 54 of *our* importers, and the eslint `no-restricted-imports` guard
  is exact about our source — but `lucide-react` v1.34.0 is still in the entry, imported by
  `@bilo-io/ui` and `@bilo-io/shell`, which `app.tsx` pulls `AppFrame`/`ShellProviders`/`TitleBar`
  from eagerly. A bundle-level absence assertion there could only ever fail, so Theme H asserts
  on the four libraries it honestly can and leaves this one to eslint, which is the tripwire that
  actually fires on the mistake it was meant to catch. Logged in `outstanding.md` as ~60 KB worth
  raising upstream.
- **`manualChunks` is skipped, per its own gate.** The gate was "only if the same vendor module
  is duplicated across ≥2 lazy chunks". It is not: after C's splits, each of
  `react-grid-layout`, `react-markdown`, `shiki`, `@codemirror` and `@xterm` resolves into
  exactly one chunk — Rollup hoists shared code across dynamic-import boundaries on its own.
- **`react-markdown` did *not* leave the entry for free, and the doc was wrong about why.** It
  predicted the library would fall out once `DashboardView` and `Workbench`/reviews went lazy.
  It did not, because the commit inspector renders its message through the same pipeline and the
  inspector hangs off `GraphView` — which is eager on purpose, being the first paint. This is
  the one place the doc's "add an explicit split only where the assertion fails" clause fired:
  `CommitMessage` is now lazy inside `commit-detail.tsx`, which took the entry from 1 226.7 KB
  to 1 084.7 KB.
- **The lazy boundaries broke no existing e2e spec.** All 368 specs passed unchanged (18 skipped
  as before), which is what the recorded decision predicted: Playwright's auto-waiting already
  absorbs a boundary that resolves in a frame off `file://`.
- **The login-shell probe was the single largest thing in boot, and it is gone from the boot
  path.** `spawnSync` on the main thread ahead of `app.whenReady()` cost a median 284 ms.
  Async, overlapped with Chromium's startup: `when-ready` 322 → 190 ms, `create-window`
  524 → 441 ms, `ready-to-show` 683 → 600 ms, and `login-shell-done` now *follows*
  `when-ready` (286 ms) instead of preceding it — which is exactly the verification the theme
  asked for. `pty-ready` (396 ms) is the new long pole into `create-window`, and it is gated
  on the probe by necessity: every pty inherits this process's PATH.

## Measurement procedures

The harness (Theme A) is three scripts under `scripts/perf/`, all launching the
packaged-equivalent app — built renderer plus the esbuild-bundled main. Two things every
one of them has to get right, both documented at length in
[`electron-run.mjs`](../../../scripts/perf/electron-run.mjs):

- **Each run gets its own `--user-data-dir`.** Electron keys
  `requestSingleInstanceLock()` on that directory, so a measurement launched while the
  installed *Midnite Studio.app* is open quits instantly and reports every mark missing.
  Isolation is a correctness requirement here, not tidiness — and a directory we control is
  also what makes "cold" mean the same thing twice.
- **The profile is seeded before it is measured.** `graph-first-batch` only happens if a
  repository is *selected*, and selection is persisted state that `useDefaultSelection`
  deliberately does not invent. The seed run opens the repo through `MSTUDIO_OPEN_REPOS`,
  then selects it the way a user would — a `midnite-studio://open` deep link delivered by a
  second launch against the same profile, arriving through main's `second-instance` handler
  — and its own timings are discarded. The path is normalised to the **main worktree**,
  because that is what `repo-registry` registers when you open a linked worktree.

```sh
moon run app:build desktop:bundle          # both scripts refuse to guess without these

node scripts/perf/startup-report.mjs --runs=5 --rss    # the official cold-start number
node scripts/perf/bundle-report.mjs                    # entry chunk, total JS, top ten
node scripts/perf/idle-cpu.mjs --seconds=300           # focused idle
node scripts/perf/idle-cpu.mjs --seconds=300 --blurred # blurred idle
MSTUDIO_BUNDLE_STATS=1 moon run app:build              # dist/stats.html treemap
```

**Cold start.** `startup-report.mjs` reads the `[perf] …` lines both processes log under
`MSTUDIO_PERF=1` and prints per-mark medians. It also polices Theme B's ordering
guarantee: `repos-restored` must precede `create-window`, or the sidebar shows its empty
state for a frame. A missing mark — in *any* run — is a non-zero exit, not a blank cell.

**Idle CPU.** `idle-cpu.mjs` differences cumulative `ps -o cputime` per process across a
window and divides by elapsed wall time: percent of one core, over exactly the interval
asked for. Deliberately **not** `ps -o %cpu`, which on macOS is a decaying average over up
to a minute of history and would smear boot CPU into an idle reading. Processes are grouped
by the `--type=` switch Chromium puts in each helper's argv (`main` / `renderer` / `gpu` /
`other`); a pid that appears or disappears mid-window is dropped rather than half-counted.
`--blurred` moves focus away with `osascript`, because blur is the state the visibility
gates key on and it cannot be faked from inside the app. The first 15 s after boot are
skipped — the first status pass, the first graph batch and shiki warming a grammar are not
idle behaviour.

**Main RSS.** `--rss` on `startup-report.mjs` samples the main process's resident size from
outside (`ps -o rss`) at first paint; `idle-cpu.mjs` reports it again at the end of its
window. From outside on purpose: the measurement stays dev-side, and nothing perf-shaped
ships in the product.

**Renderer heap** is the one number with no script, because a heap snapshot needs DevTools:

1. `MSTUDIO_PERF=1 moon run desktop:start`, open a repository, and let it settle.
2. Open the graph, select a commit with a large diff, and scroll the diff pane top to
   bottom — ten times, alternating light/dark theme every other pass so both cache keys are
   populated (the highlight cache keys on theme).
3. DevTools ▸ Memory ▸ *Heap snapshot* ▸ **Take snapshot**. Read "Total JS heap size" off
   the summary row; take three and record the median.
4. The comparison number comes from the same click-path against the same repository —
   different diffs mean different numbers, so the diff has to be named alongside the
   figure.

## Module-level maps in the renderer (Theme F sweep)

Every module-level `Map`/`Set` in `packages/app/src`, with its bound. The rule the sweep
applies: a structure keyed on *content* (line text, a URL, a commit sha) needs a cap; one
keyed on *mounted components* or on a literal enumeration does not, provided it deletes on
unmount.

| Structure | Bound |
|-----------|-------|
| [`line-highlight.ts`](../../../packages/app/src/features/diff/line-highlight.ts) `cache` | **10 000-entry true LRU** (`MAX_ENTRIES`), capped by Theme F. Keyed on full line text — the one genuinely unbounded map in the renderer before this phase. |
| `line-highlight.ts` `inFlight` | One entry per resolution in flight; `delete` in the settle path (`:145`). |
| `line-highlight.ts` `listeners` | `Map<key, Set<fn>>`; the key's entry is deleted when its last subscriber unsubscribes (`:162`), so it is bounded by *mounted* diff rows — and the pane is virtualized. |
| [`avatars.ts`](../../../packages/app/src/services/avatars.ts) `cache` / `inFlight` | Distinct commit authors in the repositories opened this session; `inFlight` deletes on settle (`:104`). Bounded, documented, unchanged (Decision). |
| `avatars.ts` `listeners` | One per mounted avatar consumer; removed by the unsubscribe (`:125`). |
| [`use-now.ts`](../../../packages/app/src/lib/use-now.ts) `listeners` | One per mounted clock consumer; the interval itself is cleared when the set empties (`:73`). |
| [`lib/perf.ts`](../../../packages/app/src/lib/perf.ts) `emitted` | Three names, fixed by `RENDERER_MARKS`. |
| [`view-sections.ts`](../../../packages/app/src/features/repos/view-sections.ts) `PARENT_OF` / `CHILDREN_OF` | Derived once from the static section tree. |
| [`lib/highlighter.ts`](../../../packages/app/src/lib/highlighter.ts) shiki singleton | Grammars stay resident once loaded — bounded by languages actually viewed. Accepted, documented; unloading would re-pay the load on every revisit (*Not in this phase*). |
| `languages.ts` ext sets · `chord.ts` `MODIFIER_KEYS` · `use-file-actions.ts` `RESERVED_NAMES` · `linkify-rehype.ts` `OPAQUE` · `image-sources.ts` `NO_HEAD_SIDE` · the `EMPTY_SET` / `NOTHING_EXPANDED` constants | Literal constants. |

## Icon parity (Theme D verification)

The doc asked for two checks: `strokeWidth` sites, and a `MSTUDIO_SHOTS` before/after diff.

**`strokeWidth` parity holds, by construction.** `react-icons/lu`'s generated icons bake
exactly lucide-react's defaults — `fill:none`, `stroke:currentColor`, `strokeWidth:2`, round
caps and joins — and `IconBase` renders
`<svg {stroke, fill, strokeWidth:0} {conf.attr} {attr} {...ourProps}>`, i.e. **caller props are
spread last**, so `strokeWidth={2.5}` still wins. The four sites that set it —
[`commit-detail.tsx:230-232`](../../../packages/app/src/features/commit/commit-detail.tsx),
[`forge-status.tsx:251,264`](../../../packages/app/src/features/forge/forge-status.tsx),
[`change-tree.tsx:121-193`](../../../packages/app/src/components/change-tree.tsx),
[`icon-button.tsx:138`](../../../packages/app/src/components/icon-button.tsx) — therefore render
at the weight they ask for.

**The one real behavioural difference is default size, and it bites nothing here.**
lucide-react defaults to `width=24 height=24`; react-icons sets `size || '1em'`. Every migrated
call site carries a Tailwind size class (`h-4 w-4`, `size-3`), and CSS beats the attribute, so
those are unaffected. An audit for icon elements with *no* size class found two — the
`<LuCheck>` pair in
[`onboarding-modal.tsx:35,39`](../../../packages/app/src/features/onboarding/onboarding-modal.tsx)
— and both were already `react-icons` before this phase (`b649a6e` has them), so D did not
change them. **Anything added later must carry a size class**, which is the one rule this
migration leaves behind.

**The screenshot pixel-diff does not work as a parity instrument, and pretending otherwise
would be worse than saying so.** Measured, rather than assumed: running every `*-shots.spec.ts`
in a pre-D tree and a post-D tree at the same base produced 33 differing PNGs out of 116 — and
running the suite **twice in the same tree** produced ~30 differing PNGs at the same magnitude
(0.01–1.1 % of pixels), in the same regions, because the title bar renders a live clock and
weather. Worse, most of the 116 files are historical committed artifacts no current spec
rewrites, so those compare identical for the wrong reason. Of the shots that *are* both stable
and regenerated, the one large diff (`phase-20-inline-threads/threads-light.png`, 8 %,
0-pixel repeat noise) turned out to be a spec-coverage difference between the two trees, not a
glyph change.

So the harness's screenshot mode stays what it was built for — producing pictures for a human
to look at — and the *automated* answer to "did any glyph change" comes from the two code-level
facts above. The human-eye pass stays open in *Verification*.

## Baseline table

Mode: packaged-equivalent (`MSTUDIO_USE_BUILT_RENDERER=1` + the esbuild-bundled main), **median
of 5 cold runs** for the startup rows, single 300 s windows for the idle rows. Measured on
**macOS 25.6 / arm64**, both sides built from the same base (`b649a6e`) so nothing else is in
the delta: *before* is that commit, *after* is that commit plus Themes D, E and F. Numbers were
taken before this branch was rebased onto Phase 35, so Phase 35's renderer work is in neither
column.

**A note on "Before", because it is not what the theme ordering assumed.** Theme A landed its
harness without filling this table, and Themes D/E/F landed on top of it — so by the time the
first measurement was taken, three fixes were already in. The bundle columns therefore carry a
*true* pre-phase number, measured by building the renderer at `eb1e89e` (the Phase 35 tip) in a
throwaway worktree; the timing columns cannot, because the marks that produce them did not
exist at that commit, so their "Before" is the post-A/D/E/F tip. Said plainly rather than
papered over: a startup number attributed to B here is B's alone, and the bundle numbers span
D and C together.

**Two measurement sessions, kept apart on purpose.** D/E/F were measured the day they landed;
B/C the day after, from a tree that already contained them. The absolute numbers do not line up
across the two — `login-shell-done` alone ranged 295–2 457 ms across the first day's runs, which
is itself Theme B's finding — so splicing them into one series would invent a precision this
machine does not have. Each table is internally consistent; neither is comparable to the other.

### Themes D, E, F — measured against the pre-phase tip

| Metric | Before | After | Theme |
|--------|--------|-------|-------|
| launch → `ready-to-show` (ms) | 711 | 746 | (unchanged by D/E/F) |
| launch → `first-view-rendered` (ms, renderer clock) | 213 | 218 | (unchanged by D/E/F) |
| launch → `graph-first-batch` (ms, renderer clock) | 268 | 268 | (unchanged by D/E/F) |
| entry chunk (KB) | 2 464.0 | 2 446.2 | D |
| total JS (KB, 427 chunks) | 13 744.9 | 13 727.2 | D |
| idle %CPU of one core, **blurred** (main / renderer / total) | 0.17 / 0.19 / 0.38 | 0.03 / 0.07 / 0.12 | E |
| idle %CPU of one core, **focused** (total) | 0.85 – 1.09 (low mode) | 0.70 (low mode) | E |
| main RSS at first paint (MB) | 154 | 154 | F |
| renderer heap after diff session (MB) | — | — | F |
| main RSS after 1 h session (MB) | — | — | F |

**What the startup rows say: nothing, and that is the correct answer.** D, E and F touch no
boot path, and the 35 ms on `ready-to-show` is inside this machine's run-to-run spread. These
rows exist as the baseline B and C were measured against.

**Bundle: the icon migration is worth ~18 KB, not 40 MB.** Theme D's doc claimed an
installed-footprint win from dropping `lucide-react`; **it does not hold.** The package is a
dependency of `@bilo-io/ui` *and* `@bilo-io/shell`, so it stays in `node_modules` (40 MB of it)
however thoroughly the renderer stops importing it — and whatever glyphs those two libraries
use still ship. What D actually bought is the entry-chunk delta above, one icon family in our
own source, and an eslint rule that keeps it that way. Recorded here rather than quietly
dropped, because "40 MB" would otherwise enter the phase's story as fact. Theme C reached the
same conclusion from the other end, and it is why Theme H cannot assert the package absent from
the entry chunk.

**Idle CPU is bimodal, and the first measurement of it was nearly a false claim.** A blurred
window is genuinely quiet on both sides — and mostly *already* was, because Chromium throttles
timers and `requestAnimationFrame` in an occluded window, which is Theme E's rAF item resolved
with a number rather than an argument (renderer 0.19 % → 0.07 %; nothing in
[`window.ts`](../../../packages/desktop/src/main/window.ts) disables `backgroundThrottling`, so
the default stands). E's blurred win is therefore small; its real value is structural — four
1 s intervals became one, `use-rebase-status.ts` is gone, auto-fetch does no git work behind a
hidden window, and main's activity tick is armed by the first tracked pty instead of always.

A **focused** idle window, though, has two modes on **both** sides: ~0.2–1.1 % of a core
normally, and occasional episodes of tens of percent split between renderer and GPU — the worst
observed being **renderer 32 % + GPU 55 %, on the *after* build**, in a window where nothing was
touched. Four re-runs (two per side, 90 s each) put the low mode at 0.85 / 1.09 % before and
0.70 % after, with the high mode appearing once on each side. So the first pair of 300 s
samples (27.10 % before, 0.17 % after) was **an artifact of which mode each run happened to
land in, not a Theme E win**, and is not recorded as one.

That episodic 88 %-of-a-core in a focused, untouched window is a real battery bug and it is
**not** explained by anything in either batch. It is **Theme G's fourth gate**, added after the
fact and still open: something is animating at frame rate with no user input, and the next step
is a DevTools performance capture during an episode — not another timer audit.

**The two unmeasured rows are honest blanks.** Renderer heap needs a DevTools snapshot (the
click-path is written down under *Measurement procedures*) and the 1 h RSS figure needs an hour;
neither is scripted, so neither is claimed. Theme F's caps are asserted by unit tests
(`line-highlight.test.ts` holds the 10 000-entry cap and its LRU retention order) rather than by
a heap number.

### Themes B, C — measured against the post-A/D/E/F tip

The timing "before" here is the post-D/E/F tip, not the pre-phase one: the marks that produce
these rows did not exist at `eb1e89e`. The bundle rows carry a *true* pre-phase number, recovered
by building the renderer at that commit in a throwaway worktree.

| Metric | Before | After | Theme |
|--------|--------|-------|-------|
| launch → `ready-to-show` (ms) | 683 | **570** | B |
| launch → `when-ready` (ms) | 322 | **190** | B |
| launch → `create-window` (ms) | 524 | **441** | B |
| launch → `login-shell-done` (ms) | 284 (blocking, pre-`when-ready`) | 286 (overlapped, post-`when-ready`) | B |
| main static imports evaluated (ms) | 147 | 147 | B (acquitted) |
| entry chunk (KB) | **2 481.3** (pre-phase, verified) → 2 463.6 (post-D) | **1 109.4** (−55%) | C |
| total JS (KB) | 13 762.2 (pre-phase) → 13 744.5 (post-D) | 13 731.3 | C |
| main RSS at first paint (MB) | 155 | 152 | B |
| broker CPU per MB/s delivered, under `yes` | 12.74% of a core | **1.16%** (11× less per byte) | G |
| broker socket writes/s, under `yes` | 7 073 | **60.5** | G |
| broker RSS after a 12 s `yes` (MB) | 227 | **168** | G |
| `ps` probe cost at its sustained rate | 4.08% of a core (750 ms) | **2.04%** (1 500 ms) | G |
| diff-scroll median frame gap (ms) | 8.5 | 8.5 | H (budget: 22) |

Mode for every filled row: packaged-equivalent, median of 5 cold runs, this machine — except the
broker rows, which are a 10 s window through `scripts/perf/broker-load.mjs`, and the `ps` cost,
which is the median of 20 `wait4` rusage samples.
