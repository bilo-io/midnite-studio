# Phase 36 — Faster, lighter, same app

The app is feature-rich and visibly finished — and it has never once been measured. The entry
chunk is **2.52 MB** because every view is a static import in
[`app.tsx`](../../../packages/app/src/app.tsx) (the only `React.lazy` in the whole renderer is
the CodeMirror editor behind
[`file-preview.tsx:25`](../../../packages/app/src/features/files/preview/file-preview.tsx));
main serializes **four awaits and a login-shell spawn** ahead of `createWindow()` in
[`main/index.ts`](../../../packages/desktop/src/main/index.ts); an idle, blurred window still
runs **three separate 1 s clock intervals**, an unconditional 2 s rebase poll, per-repo
auto-fetch with no visibility gate, and a 1 s activity tick in main; and the diff highlight
cache in
[`line-highlight.ts:46`](../../../packages/app/src/features/diff/line-highlight.ts) is an
unbounded module-level `Map` keyed on full line text. This phase is the whole loop: **measure,
fix what the numbers indict, and leave budgets behind** so it cannot silently regress. Nothing
user-facing changes — no pixel, no behaviour, no keybinding. If a change would alter what the
user sees or how the app responds, it does not belong in this phase.

**Builds on.** Phase 18's metrics sampler already has the correct idle posture — adaptive
cadence, `timer.unref()`, and a **pause-on-blur** binding in
[`metrics-handlers.ts:55`](../../../packages/desktop/src/main/ipc/metrics-handlers.ts) — this
phase applies that existing pattern to every other timer. Phase 20 D's idle-scheduled shiki and
Phase 26's virtualized diff already paid their render bills;
[`diff-scroll-perf.spec.ts`](../../../packages/app/e2e/diff-scroll-perf.spec.ts) is the repo's
one perf spec and becomes the seed of the budget suite. Two deferred items are pre-written for
this phase: **interval-tree edge culling** ([`outstanding.md`](../outstanding.md), gated on
profiling) and **broker socket frame batching**
([`phase-30`](phase-30-terminal-hardening.md), deferred "if the socket ever shows up in a
profile").

**Scope guardrails.** Strict measurement discipline: **every landed item records a
before/after number** (ms, KB, %CPU, or heap MB) in this doc's baseline table — no placebo
optimisations. **No browser-tab code**: background-`WebContentsView` suspension overlaps
Phase 32's unfinished themes E/F and stays theirs. **No UI surface**: measurement tooling is
dev-side scripts under `scripts/perf/`, not product code (extending the in-app monitor was
considered and rejected). Budgets live in a **separate `:perf` target**, outside the default
`:test` gate, because timing specs are machine-sensitive and must not flake unrelated work.
Also out: `load more` past the 50 k-commit cap, and the `_INDEX.md` reconciliation pass for
phases 25/32/33.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Baseline & harness (S/M)

Lands first — every other theme's before/after numbers come from here.

- [ ] Boot timing marks in main behind an `MSTUDIO_PERF=1` env flag: elapsed-ms log lines (via
      [`main/log.ts`](../../../packages/desktop/src/main/log.ts)) around each boot stage in
      [`main/index.ts`](../../../packages/desktop/src/main/index.ts) —
      `ensureLoginShellPath`, `whenReady`, each of the four awaits
      (`migrateAnyLegacyRepoStore`, `initPtyService`, `listAgents`, `restoreRepos`),
      `createWindow`, and the window's `ready-to-show`
      ([`window.ts:86`](../../../packages/desktop/src/main/window.ts)). Today there is zero
      timing instrumentation anywhere in main.
- [ ] Renderer first-interactive marks: `performance.mark` at renderer entry, first view
      render, and first graph batch painted in
      [`app.tsx`](../../../packages/app/src/app.tsx); surfaced in the same `MSTUDIO_PERF` log.
- [ ] `scripts/perf/startup-report.mjs` — launches the app with `MSTUDIO_PERF=1`, parses the
      marks, prints a stage-by-stage table (launch → window visible → interactive graph).
- [ ] `scripts/perf/bundle-report.mjs` — builds `packages/app`, prints entry-chunk size, total
      JS, and the top-10 chunks; wires `rollup-plugin-visualizer` behind an env flag for
      drill-downs. No stats artifact exists today.
- [ ] A short heap-measurement procedure (renderer heap snapshot via DevTools; main
      `process.memoryUsage()` sampled by script) written into this doc — repeatable, not
      folklore.
- [ ] **Record the baseline table in this doc** before any fix lands: cold start (launch →
      window visible, window → interactive), entry chunk KB, total JS KB, idle %CPU
      (main + renderer, focused and blurred, 5 min untouched), renderer heap after a
      diff-scroll session. Every theme below appends its after-numbers to the same table.

### B — Main-process startup (M)

- [ ] Take `ensureLoginShellPath()` off the critical path — it spawns a login shell **before**
      `app.whenReady()` ([`main/index.ts:187`](../../../packages/desktop/src/main/index.ts));
      start it concurrently and await the resolved PATH only where it is consumed (pty spawn),
      not before the window can exist.
- [ ] Parallelize the four serialized awaits inside `whenReady()` where order-independent,
      **preserving the deliberate guarantee** the code comments: `restoreRepos()` completes
      before first paint so the sidebar never flashes empty — hold that line at the
      `ready-to-show` gate instead of serializing everything behind the git work.
- [ ] Audit the 60+ eager static imports at the top of `main/index.ts`; dynamically import
      modules that are heavy and never needed before first interaction (councils, forge,
      update-service candidates) where it does not contort handler registration. Measured —
      revert any split that saves nothing.
- [ ] `minify: true` in
      [`scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) (esbuild currently
      ships main/preload/broker unminified; keep sourcemaps for stack traces).
- [ ] Before/after: launch → window-visible ms and window → interactive ms in the baseline
      table.

### C — Renderer bundle & lazy views (M)

- [ ] `React.lazy` + `Suspense` per view at the `app.tsx` view switch (~lines 819–845):
      `ActionsView`, `CouncilsView`, `TestsView`, `DashboardView`, `FilesView`, `ReviewsView`,
      `SearchView`, `SettingsView`, `Workbench`, `BrowserPane`. **GraphView stays eager** — it
      is the first paint. Fallback renders the view's existing empty-state shell so a slow
      chunk load is indistinguishable from today's mount.
- [ ] Split xterm out of the entry: `@xterm/xterm` + the webgl addon ride
      [`terminal-panel.tsx:14`](../../../packages/app/src/features/terminal/terminal-panel.tsx)
      → `terminal-view.tsx` into the boot path today. Ctrl+` must open the terminal with no
      perceptible added latency (idle-time chunk preload if needed).
- [ ] Push `react-grid-layout`
      ([`dashboard-view.tsx`](../../../packages/app/src/features/dashboard/dashboard-view.tsx))
      and `react-markdown`/`remark-gfm`
      ([`commit-message.tsx`](../../../packages/app/src/features/commit/commit-message.tsx),
      reviews views) behind the same split points. Check whether `@dnd-kit/*` can leave the
      entry — its graph consumer is eager, so it may legitimately stay.
- [ ] `build.rollupOptions.manualChunks` in
      [`vite.config.ts`](../../../packages/app/vite.config.ts) where `lazy()` alone leaves
      vendor duplication across chunks (the config currently has no rollup options at all).
- [ ] Gate production sourcemaps behind `MSTUDIO_SOURCEMAP=1` — `dist/` is 70 MB of which
      ~54 MB is maps (`sourcemap: true` unconditionally, in both Vite and esbuild).
- [ ] Before/after: entry chunk KB (baseline 2.52 MB), total JS KB, window → interactive ms.

### D — One icon family (M)

- [ ] Migrate all **55** files importing `lucide-react` to `react-icons/lu` (the same Lucide
      glyphs re-exported — a rename, `ChevronLeft` → `LuChevronLeft`). The structural
      `IconComponent` type in
      [`icon-button.tsx`](../../../packages/app/src/components/icon-button.tsx) accepts both
      families, so no API changes. 75 files are already on `react-icons`; some files
      (`app.tsx` included) currently import from **both** packages.
- [ ] Any glyph without an exact `Lu*` equivalent: nearest `react-icons` match, with a
      before/after screenshot to confirm visual parity — a visible glyph change is a blocker,
      not a judgement call.
- [ ] Remove `lucide-react` from `packages/app/package.json` and add a `no-restricted-imports`
      entry for it in [`eslint.config.mjs`](../../../eslint.config.mjs) so it cannot creep
      back.
- [ ] Update the icon convention in [`CLAUDE.md`](../../../CLAUDE.md), `AGENTS.md` and
      `GEMINI.md` (all three, per the sync rule): `react-icons` is now the only family; the
      "lucide-react stays, the two coexist" paragraph is superseded by this phase.
- [ ] Before/after: renderer chunk KB attributable to icons, plus installed-footprint note
      (`lucide-react` is 40 MB in `node_modules`).

### E — Idle-CPU zero (M)

The pattern to copy is Phase 18's own sampler: adaptive, `unref()`, paused on blur
([`metrics-handlers.ts:55`](../../../packages/desktop/src/main/ipc/metrics-handlers.ts)).

- [ ] One shared clock-tick store for the renderer: a single visibility-gated 1 s interval
      feeding
      [`titlebar-status.tsx`](../../../packages/app/src/features/titlebar-status/titlebar-status.tsx),
      `time-section.tsx` and `world-clocks-section.tsx` — today each runs its own 1 s
      interval, three re-renders per second, forever, even blurred. Pause on
      `document.hidden`; snap to the correct time on resume.
- [ ] Gate the rebase-status poll on an actual rebase:
      [`use-rebase-status.ts:22`](../../../packages/app/src/features/rebase/use-rebase-status.ts)
      polls IPC every 2 s unconditionally once mounted — start polling when a rebase op
      begins, stop when it resolves.
- [ ] Visibility-gate `useAutoFetch` ([`app.tsx:268`](../../../packages/app/src/app.tsx)):
      skip ticks while blurred/hidden (it fires one `ops.fetch` per repo per tick today), run
      one immediate catch-up fetch on refocus so the user never sees staler data than now.
- [ ] Stop decorative rAF loops when hidden:
      [`spinner.tsx:161`](../../../packages/app/src/components/spinner.tsx) and
      [`neuro-cloud-background.tsx:54`](../../../packages/app/src/features/screensaver/neuro-cloud-background.tsx)
      run regardless of `document.hidden`.
- [ ] Replace the screensaver 1 s idle poll
      ([`screensaver-host.tsx:32`](../../../packages/app/src/features/screensaver/screensaver-host.tsx))
      with a single re-armed `setTimeout` reset by the existing activity events.
- [ ] Main: pause the always-on 1 s `tickActivityClocks` interval
      ([`main/index.ts:280`](../../../packages/desktop/src/main/index.ts)) when no window is
      focused **and** no pty has recent output — mirroring `bindMetricsToWindow`.
- [ ] Before/after: main + renderer %CPU after 5 min untouched, measured focused **and**
      blurred.

### F — Memory: caps where growth is unbounded (S/M)

- [ ] LRU-cap the diff highlight cache
      ([`line-highlight.ts:46`](../../../packages/app/src/features/diff/line-highlight.ts)) —
      module-level `Map` keyed on `${dark} ${path} ${kind} ${text}` (full line text in the
      key), **no eviction, no cap, no clear**; it grows for the life of the process. Map
      re-insertion-order LRU, cap ≈ 10 k entries, hit-rate measured before tuning.
- [ ] Audit scrollback duplication in main:
      [`pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts) holds
      `scrollbackBySession` (2 × 1 MB allowance per session) **and** a `snapshotCache` of full
      copies, while [`broker/server.ts`](../../../packages/desktop/src/broker/server.ts) holds
      its own `scrollbackBySession` — establish single ownership per buffer or document why
      both exist, and verify `trimScrollback` bounds hold over a long session.
- [ ] Sweep `packages/app/src` for other module-level unbounded `Map`s; cap or explicitly
      justify each (the avatar cache in
      [`avatars.ts`](../../../packages/app/src/services/avatars.ts) is bounded in practice by
      distinct authors — document that and move on).
- [ ] Before/after: renderer heap after scrolling ten 4 000-line diffs; main RSS after a
      scripted 1-hour session.

### G — Profile-gated claims (S/M)

Each item here ends in one of two honest states: a landed fix with numbers, or recorded
numbers that acquit the suspect. Either closes the item.

- [ ] Profile graph edge rendering on a very large repo (≈50 k commits): if edge rendering is
      the frame-time bottleneck, land the **interval-tree edge culling** pre-written in
      [`outstanding.md`](../outstanding.md) (~180× on the naive path); if not, record the
      acquitting profile there and close the deferral.
- [ ] Profile the broker socket under a chatty agent — Phase 30 deferred frame batching as "a
      measured change for a later phase if the socket ever shows up in a profile"
      ([`phase-30`](phase-30-terminal-hardening.md)). Batch only if indicted.
- [ ] Profile [`agent-watcher.ts`](../../../packages/desktop/src/main/agent-watcher.ts) under
      continuous output — a chatty agent triggers a full `ps` process-table read every 750 ms
      (`QUIET_MS`); widen the quiet window or gate on active sessions only if the profile
      shows it.

### H — Perf budgets that outlive the phase (S/M)

- [ ] A `perf` task in [`packages/app/moon.yml`](../../../packages/app/moon.yml) modeled on
      the existing `e2e` task (`mergeArgs: 'replace'`, deps on `root:install` +
      `shared:build`), running `playwright test e2e/perf/` — deliberately **outside** the
      `:test` gate, exactly as `e2e` already is.
- [ ] Split [`diff-scroll-perf.spec.ts`](../../../packages/app/e2e/diff-scroll-perf.spec.ts):
      structural assertions (mounted-row bounds) stay in `e2e`; the timing assertion
      (median inter-frame gap) moves to the `:perf` suite as a budget — resolving Phase 26's
      open question about exact-count vs budget.
- [ ] Bundle budget: a spec that reads the build output and fails when the entry chunk
      exceeds budget — the tripwire for the day someone re-adds a static view import.
- [ ] Startup budget: assert the Theme A boot marks stay under budget in the `:perf` suite
      (packaged-or-dev mode documented, whichever proves stable).
- [ ] Budgets set at **2.5× the post-phase measured baseline** and recorded here with a
      rebaselining procedure; `:perf` is advisory and on-demand (machine-sensitive), never in
      the default gate.

## Files this phase touches

| Area | Files |
|------|-------|
| Main boot | [`main/index.ts`](../../../packages/desktop/src/main/index.ts) · [`main/window.ts`](../../../packages/desktop/src/main/window.ts) · [`scripts/bundle.mjs`](../../../packages/desktop/scripts/bundle.mjs) |
| Renderer shell | [`app.tsx`](../../../packages/app/src/app.tsx) · [`vite.config.ts`](../../../packages/app/vite.config.ts) |
| Timers/pollers | [`titlebar-status/*`](../../../packages/app/src/features/titlebar-status) · [`use-rebase-status.ts`](../../../packages/app/src/features/rebase/use-rebase-status.ts) · [`screensaver-host.tsx`](../../../packages/app/src/features/screensaver/screensaver-host.tsx) · [`spinner.tsx`](../../../packages/app/src/components/spinner.tsx) |
| Memory | [`line-highlight.ts`](../../../packages/app/src/features/diff/line-highlight.ts) · [`pty-service.ts`](../../../packages/desktop/src/main/pty-service.ts) · [`broker/server.ts`](../../../packages/desktop/src/broker/server.ts) |
| Icons | ~55 `lucide-react` importers across `packages/app/src` · [`eslint.config.mjs`](../../../eslint.config.mjs) · [`CLAUDE.md`](../../../CLAUDE.md) + `AGENTS.md` + `GEMINI.md` |
| Harness/budgets | `scripts/perf/*` (new) · [`packages/app/moon.yml`](../../../packages/app/moon.yml) · [`e2e/diff-scroll-perf.spec.ts`](../../../packages/app/e2e/diff-scroll-perf.spec.ts) · `e2e/perf/*` (new) |

## Verification

- [ ] `moon run :typecheck :lint :test` green.
- [ ] `moon run app:perf` runs and passes on this machine with the recorded budgets.
- [ ] The baseline table in this doc has a before **and** after number for every landed item —
      the strict-measurement rule; an item with no number is not done.
- [ ] Visual parity pass: screenshots of each main view before/after (icon migration + lazy
      fallbacks) show no user-visible difference; view switching shows no flash-of-fallback on
      a warm cache.
- [ ] Ctrl+` opens the terminal with no perceptible added latency after the xterm split.
- [ ] Blur/refocus behaves identically to today from the user's seat: clocks are correct on
      resume, auto-fetch runs its catch-up, the rebase banner still appears promptly when a
      rebase starts.

## Decisions / open questions

Settled in the brainstorm (2026-09-01):

- **Strict measurement** — every item records before/after numbers; no placebo landings.
- **Full icon migration** to `react-icons`; `lucide-react` removed; conventions files updated.
- **Browser-tab suspension deferred to Phase 32** — this phase stays out of browser-tab code.
- **Budgets in a separate `:perf` target**, not the `:test` gate; budgets at 2.5× baseline.
- **Startup means both processes** — main boot and renderer first-interactive.
- **Dev-side scripts, no in-app perf UI** — the no-UX-change rule applies to the tooling too.
- **Prod sourcemaps env-gated** (`MSTUDIO_SOURCEMAP=1`) rather than always-on.

Still open:

- **Lazy-view fallback shape** — recommend: render nothing for <100 ms, then the view's
  existing skeleton/empty shell; decide per-view during C if any chunk is slow enough to show.
- **Can `@dnd-kit/*` leave the entry chunk?** The graph consumer is eager; measure whether the
  sortable-list/tab-strip consumers justify a split or whether it stays. Recommend: keep if
  the saving is <50 KB.
- **Highlight-cache LRU cap value** — recommend 10 k entries as the starting cap; measure the
  hit rate on a heavy review session before tuning either way.
- **Main-process dynamic-import depth** (B) — how many handler modules are worth deferring
  before registration code gets contorted; recommend stopping at the first split that saves
  <10 ms.
