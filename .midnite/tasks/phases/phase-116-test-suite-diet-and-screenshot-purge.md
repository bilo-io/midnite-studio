# Phase 116 — Test suite diet and screenshot purge

**Written with the user** (via `/midnite-ideate`) · 2026-10-21

[Phase 82](phase-82-the-pyramid-righted.md) established the righted test pyramid and split the CI gate by platform, but two subsequent developments caused CI wall-clock time to double back up to **20m03s** (measured on CI run `39615582410`, 2026-10-21) while the repository accumulated **176.5 MB of historical PR screenshots**:

1. **The feature-package explosion broke `gate-node`.** [Phase 113](phase-113-midnite-apps-suite-split.md) extracted 29 `packages/features/<name>` packages plus `packages/frame` and `packages/runtime`. Because [`ci.yml`](../../../.github/workflows/ci.yml)'s `gate-node` runs `moon run <pkg>:typecheck <pkg>:lint <pkg>:test` across 36 projects, a single 2-vCPU Ubuntu runner now spawns **107 separate Node processes** (36 `tsc --noEmit`, 36 `eslint .` parsing [`eslint.config.mjs`](../../../eslint.config.mjs) 36 times, and 35 `vitest run` instances each booting Vite + jsdom from cold). `gate-node` bloated from **341s (5m41s)** in Phase 82 to **885s (14m45s)**.
2. **The screenshot corpus grew unchecked.** `docs/screenshots/` holds **1,483 image files totaling 176.47 MB**, of which **1,458 files (~172 MB) are unreferenced anywhere** in `README.md`, `docs/`, or `packages/` — they were committed only for one-off PR bodies via `/midnite-create` and `/midnite-create-adhoc`. Meanwhile, `packages/app/e2e/` still carries **158 `*-shots.spec.ts` files** (463 tests, 493 `.screenshot()` calls) and **54 `.screenshot()` calls embedded inside 22 functional E2E specs** (7 of which are completely unguarded and run on every CI pass, including a `/tmp/lock-screen-widgets.png` write in [`lock-screen-widgets.spec.ts`](../../../packages/app/e2e/lock-screen-widgets.spec.ts)).
3. **Functional E2E is still top-heavy at 477 tests across 3 macOS shards (20m03s wall).** Phase 82 Wave 5 stopped before the multi-test partial-keep files (`fab-loops.spec.ts` at 40 tests, `browser-pane.spec.ts` at 23, `graph-themes.spec.ts` at 20, `workflows.spec.ts` at 16, `footer-monitor.spec.ts` at 15, `midnite-menu.spec.ts` at 15, `companion-panel.spec.ts` at 12, `titlebar-agents.spec.ts` at 12). Together, the 23 functional specs with > 5 tests hold **310 of the 477 tests (65%)**, plus **79 `waitForTimeout()` sleeps** across the functional suite.
4. **`gate-locale` duplicates a scarce macOS VM slot.** [`ci.yml`](../../../.github/workflows/ci.yml) caps concurrent macOS jobs at 5 (`gate-native`, `gate-locale`, and 3 `e2e` shards). `gate-locale` boots an entire `macos-14` VM for **321s** just to re-run `desktop:test` and `git-engine:test` under `LC_ALL=de_DE.UTF-8` — the exact two suites `gate-native` already builds and runs in **349s**. Folding the locale step into `gate-native` frees the 5th macOS slot so `e2e` can run **4 shards instead of 3** with zero queueing.

This phase attacks all four levers together to bring total PR CI wall-clock time down from **~20m to ~5–6m** and purge **~172 MB of redundant screenshots and 158 dead shot specs**.

Scope guardrails:
- **Never weaken or delete a behavioral assertion.** Every E2E test removed in Theme C must have its exact behavioral/DOM/store assertion migrated to Vitest (`packages/app/src/**/*.test.tsx` or the owning `packages/features/*/renderer/*.test.tsx`) before the Playwright test is deleted.
- **Keep per-package moon tasks working locally.** `moon run <pkg>:test`, `<pkg>:lint`, and `<pkg>:typecheck` remain intact for focused local loops; Theme A adds root-level single-process tasks (`root:lint-all`, `root:test-node`) for fast CI and whole-repo local verification.
- **Visual regression baselines (`packages/app/e2e/visual/__screenshots__/linux/`) are untouched.** Those 32 component-crop PNGs belong to `moon run app:visual` and `scripts/visual-budget.mjs`, not `docs/screenshots/`.
- **Keep the ~25 `docs/screenshots/` images actively referenced by `README.md` and `docs/WEBSITE.md`.** Only unreferenced historical PR-body screenshots and one-off `*-shots.spec.ts` generators are purged.

> **Effort tags:** S ≈ ≤ 2h · M ≈ half-day to a day · L ≈ 1–2 days. Themes A, B, and D are independent and can land first in parallel; Theme C spans two focused waves (C1 and C2) against `packages/app/e2e/`; Theme E locks the new caps and conventions once B and C land.

## Headlines

*Collapsing 107 per-package CI process spawns into shared runner pools, purging 158 one-off screenshot specs and ~172 MB of unreferenced PR PNGs, migrating ~280 non-geometry E2E tests into Vitest, and rebalancing the 5-slot macOS CI budget to cut PR wall-clock from ~20m to ~5–6m.* (50% · 14/28) — **In flight 2026-10-21.**

**Theme A — Collapse the 36-package `gate-node` tax.** ✅ (PR #952) Consolidated 36 per-package `moon run` invocations in `gate-node` into three single-pass tasks (`root:typecheck-node`, `root:lint-all`, and `root:test-node`), collapsing 107 separate Node process spawns into shared runner pools.

**Theme B — Purge the 158 `*-shots.spec.ts` files, 54 inline E2E screenshots, and ~172 MB of unreferenced PNGs.** ✅ (PR #951) Purged 1,475 unreferenced PNGs from `docs/screenshots/` (~178 MB saved, keeping 10 referenced), deleted 159 screenshot specs (`packages/app/e2e/*-shots.spec.ts` and `shots.spec.ts`), stripped 47 disk-writing screenshot blocks across 18 functional specs, and updated skills to direct visual verification shots to `/tmp/`.

**Theme C — Deep functional E2E diet (477 → ≤ 200 tests) and `waitForTimeout` purge.** ◻ Audit the 23 multi-test functional E2E specs (310 tests), migrate ~280 DOM/text/store assertions into Vitest across two waves (`fab-loops`, `browser-pane`, `graph-themes`, `workflows`, `footer-monitor`, `midnite-menu`, `companion-panel`, `titlebar-agents`, `ref-sync`, `reviews`, `files-view`, `councils`, `notes`, `terminal`), and replace arbitrary `page.waitForTimeout()` sleeps with web-first assertions.

**Theme D — CI runner topology and gate-locale fold.** ✅ (PR #950) Folded `gate-locale` into `gate-native` to save a 321s macOS VM boot, expanded `e2e` to 4 macOS shards within the hard 5-slot macOS cap, and right-sized `gate-node-app-test` from 4 Ubuntu shards to 2.

**Theme E — Ratchet & budget guards (`MAX_DECLARED_E2E ≤ 200`, screenshot & `waitForTimeout` bans).** ◻ Lower `MAX_DECLARED_E2E` in `scripts/e2e-budget.mjs` from 480 to ≤ 200, fail on any `docs/screenshots/` file not referenced by `README.md` or `docs/*.md`, fail on any `.screenshot({ path })` or un-allowlisted `waitForTimeout(` in functional E2E specs, and sync `docs/TESTING.md` + `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`.

## Deliverables

### A — Collapse the 36-package `gate-node` tax (M)

- [x] Add a workspace-level Vitest multi-project configuration (`vitest.node-gate.config.ts`, wired as `moon run root:test-node`) that registers the 35 node-portable packages in `NODE_PROJECTS` (from [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs), excluding `app` which runs in `gate-node-app-test`) plus `scripts/**/*.test.mjs` as Vitest `projects`, so Vitest boots once and shares one worker pool instead of spawning 35 separate Node/Vite processes.
- [x] Add a `root:lint-all` task in [`moon.yml`](../../../moon.yml) running `pnpm exec eslint . --cache --cache-location .moon/cache/eslint/` once across the workspace, instead of invoking `pnpm exec eslint .` 36 separate times per package in `gate-node`.
- [x] Add a batched `root:typecheck-node` task (or parallel `tsc --noEmit` runner script) covering the 36 `NODE_PROJECTS` packages without moon's sequential 36-task process-spawn overhead, while keeping [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs) verifying 100% package coverage.
- [x] Update [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)'s `gate-node` job to invoke the consolidated root tasks (`root:typecheck-node`, `root:lint-all`, `root:test-node`), while preserving individual `<pkg>:typecheck`, `<pkg>:lint`, and `<pkg>:test` tasks in [`.moon/tasks/typescript.yml`](../../../.moon/tasks/typescript.yml) for targeted local runs.
- [x] Measure and record `gate-node` wall-clock time on CI before and after (target: **885s → ~120–180s**).

### B — Purge the 158 `*-shots.spec.ts` files, 54 inline E2E screenshots, and ~172 MB of unreferenced PNGs (M)

- [x] Audit `docs/screenshots/` for every image referenced in `README.md`, `docs/*.md`, or `packages/website/` (~25 files), and delete all ~1,458 unreferenced PR-body screenshot files and subdirectories (~172 MB freed from the working tree).
- [x] Delete the 158 one-off `packages/app/e2e/*-shots.spec.ts` files and [`packages/app/e2e/shots.spec.ts`](../../../packages/app/e2e/shots.spec.ts) (which tests nothing beyond writing 4 documentation PNGs). Keep [`packages/app/e2e/shots-helper.ts`](../../../packages/app/e2e/shots-helper.ts) trimmed to what `packages/app/e2e/visual/*.spec.ts` and functional specs actually import (`REPRODUCIBLE_ISO_DATE`, `buildReproducibleHistory`, `stubGravatars`, `mockWeatherApi`, `setReducedMotion`, `setTheme`).
- [x] Remove the 47 `if (process.env.MSTUDIO_SHOTS) { await page.screenshot(...); }` blocks and screenshot-only `test()` blocks scattered across 18 functional specs (`terminal.spec.ts`, `footer-monitor.spec.ts`, `busy-spinner.spec.ts`, `graph-selection.spec.ts`, `phase-21-roster.spec.ts`, `commit-inspector.spec.ts`, `diagnostics.spec.ts`, `files-search.spec.ts`, `files-view.spec.ts`, `graph-recency.spec.ts`, `graph-themes.spec.ts`, `repo-favourites.spec.ts`, `files-editor.spec.ts`, `files-write.spec.ts`, `ref-drag.spec.ts`, `repos-workbench.spec.ts`, `settings-pages.spec.ts`), and delete the unguarded `/tmp/lock-screen-widgets.png` write at [`packages/app/e2e/lock-screen-widgets.spec.ts:111`](../../../packages/app/e2e/lock-screen-widgets.spec.ts). Keep the 6 in-memory buffer `screenshot()` calls in `cascade-reduced-motion.spec.ts` (4), `companion-panel-glow.spec.ts` (1), and `model-editor.spec.ts` (1) that decode pixel buffers in memory without writing to disk.
- [x] Remove the `MSTUDIO_SHOTS` branches from [`packages/app/playwright.config.ts`](../../../packages/app/playwright.config.ts) and [`scripts/e2e-budget.mjs`](../../../scripts/e2e-budget.mjs).
- [x] Update [`.agents/skills/midnite-create/SKILL.md`](../../../.agents/skills/midnite-create/SKILL.md) and [`.agents/skills/midnite-create-adhoc/SKILL.md`](../../../.agents/skills/midnite-create-adhoc/SKILL.md) (plus their `.claude/skills/` and `.codex/skills/` mirrors if present) so Stage 5 / Stage 7/8 visual verification captures screenshots to `/tmp/midnite-shots-<slice>/` and renders them inline in the thread without ever committing PNGs into `docs/screenshots/<slice>/`.

### C — Deep functional E2E diet (477 → ≤ 200 tests) and `waitForTimeout` purge (L)

- [ ] **Wave C1 — the top 8 multi-test partial-keep files (153 E2E tests → ~40):**
  - [`packages/app/e2e/fab-loops.spec.ts`](../../../packages/app/e2e/fab-loops.spec.ts) (40 tests → ~8): keep only the genuine conic-gradient/arc mask and computed-glow geometry tests; migrate the ~32 menu, toggle, cadence, CRUD, and store-state tests to Vitest.
  - [`packages/app/e2e/browser-pane.spec.ts`](../../../packages/app/e2e/browser-pane.spec.ts) (23 tests → ~4): keep only the real layout/split-pane resize and WebContentsView occluder geometry tests; migrate tab management, URL bar, bookmarks, and history assertions to Vitest (`packages/features/browser/`).
  - [`packages/app/e2e/graph-themes.spec.ts`](../../../packages/app/e2e/graph-themes.spec.ts) (20 tests → ~3): keep SVG leader-line `boundingBox` and computed lane color resolution; migrate theme selection, persistence, and avatar fallback logic to Vitest.
  - [`packages/app/e2e/workflows.spec.ts`](../../../packages/app/e2e/workflows.spec.ts) (16 tests → ~4): keep React Flow palette HTML5 drag-and-drop, handle resize, and panel-collapse viewport shift; migrate node inspector, run panel tabs, and filter assertions to Vitest (`packages/features/workflows/`).
  - [`packages/app/e2e/footer-monitor.spec.ts`](../../../packages/app/e2e/footer-monitor.spec.ts) (15 tests → ~2): keep popover bounds/hit-testing; migrate metric formatting, process list sorting, and tab switching to Vitest (`packages/features/monitor/`).
  - [`packages/app/e2e/midnite-menu.spec.ts`](../../../packages/app/e2e/midnite-menu.spec.ts) (15 tests → ~2): keep real pointer/backdrop geometry; migrate menu sections, mnemonics, and command dispatch to Vitest.
  - [`packages/app/e2e/companion-panel.spec.ts`](../../../packages/app/e2e/companion-panel.spec.ts) (12 tests → ~2): keep chip bar layout/focus; migrate voice/text command routing and transcript state to Vitest.
  - [`packages/app/e2e/titlebar-agents.spec.ts`](../../../packages/app/e2e/titlebar-agents.spec.ts) (12 tests → ~3): keep responsive width-shedding (`getBoundingClientRect`) and CSS animation checks; migrate agent pill lists, launch triggers, and dropdown items to Vitest.
- [ ] **Wave C2 — the remaining 15 multi-test files (157 E2E tests → ~55):**
  - [`packages/app/e2e/terminal.spec.ts`](../../../packages/app/e2e/terminal.spec.ts) (41 tests → ~12): keep real `@xterm/xterm` DOM rendering, ANSI escape sequences, chord escape (`Ctrl+\``, `Mod+k`, `Mod+r`), and resize observer fit; migrate session tab bar CRUD, naming, agent roster filtering, and store transitions to Vitest.
  - [`packages/app/e2e/kanban.spec.ts`](../../../packages/app/e2e/kanban.spec.ts) (15 tests → ~6): keep real pointer drag-and-drop (`DndContext`), play-button coordinate menu, and `IntersectionObserver` in-card terminal mount; migrate card filtering, modal forms, and column CRUD to Vitest (`packages/features/tasks/`).
  - [`packages/app/e2e/ref-sync.spec.ts`](../../../packages/app/e2e/ref-sync.spec.ts) (11 → ~2), [`packages/app/e2e/graph-selection.spec.ts`](../../../packages/app/e2e/graph-selection.spec.ts) (10 → ~3), [`packages/app/e2e/reviews.spec.ts`](../../../packages/app/e2e/reviews.spec.ts) (10 → ~2), [`packages/app/e2e/files-view.spec.ts`](../../../packages/app/e2e/files-view.spec.ts) (9 → ~2), [`packages/app/e2e/councils.spec.ts`](../../../packages/app/e2e/councils.spec.ts) (8 → ~2), [`packages/app/e2e/notes.spec.ts`](../../../packages/app/e2e/notes.spec.ts) (8 → ~2), [`packages/app/e2e/ref-drag.spec.ts`](../../../packages/app/e2e/ref-drag.spec.ts) (8 → ~4), [`packages/app/e2e/lock-screen-widgets.spec.ts`](../../../packages/app/e2e/lock-screen-widgets.spec.ts) (6 → ~2), [`packages/app/e2e/nav-shell.spec.ts`](../../../packages/app/e2e/nav-shell.spec.ts) (6 → ~2), [`packages/app/e2e/project-graph.spec.ts`](../../../packages/app/e2e/project-graph.spec.ts) (6 → ~3), [`packages/app/e2e/repos-workbench.spec.ts`](../../../packages/app/e2e/repos-workbench.spec.ts) (6 → ~2), [`packages/app/e2e/shortcut-rail.spec.ts`](../../../packages/app/e2e/shortcut-rail.spec.ts) (6 → ~2): migrate all pure DOM/store assertions to Vitest, leaving only genuine layout/drag/CSS/focus tests.
- [ ] Audit the remaining 1–5 test functional specs (`commit-inspector.spec.ts`, `settings-pages.spec.ts`, `landing.spec.ts`, `files-search.spec.ts`, `diagnostics.spec.ts`, etc.) and migrate any remaining pure-DOM tests so total declared functional E2E tests land **≤ 200** (down from 477).
- [ ] Ensure every surviving functional E2E spec carries the mandatory header comment naming which browser capability (`getBoundingClientRect`, computed CSS, pointer drag, xterm, canvas/WebGL, focus order, paint/z-order, or network/CSP interception) justifies its presence per [`docs/TESTING.md`](../../../docs/TESTING.md).
- [ ] Replace the **79 `page.waitForTimeout(...)` calls** across `packages/app/e2e/*.spec.ts` (including 15 in `terminal.spec.ts`, 7 in `model-editor.spec.ts`, 5 in `fab-loops.spec.ts`, 5 in `status-bar.spec.ts`, 4 in `graph-selection.spec.ts`, 4 in `panel-snap.spec.ts`) with web-first `expect.poll(...)` or `expect(locator).toBe...` conditions, except where a short deterministic wait is proving a negative ("nothing happened after N ms") and is explicitly documented.

### D — CI topology rebalance: fold `gate-locale` into `gate-native`, 4 `e2e` shards, 2 `app:test` shards (S)

- [x] In [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml), fold the `gate-locale` step (`LC_ALL=de_DE.UTF-8 pnpm exec moon run desktop:test git-engine:test`) into `gate-native` as a subsequent step (or run `gate-native`'s test step under `LC_ALL=de_DE.UTF-8` directly if all tests are locale-clean) and delete the standalone `gate-locale` job — saving a full macOS VM boot, checkout, and `pnpm install` (~90s overhead) and freeing 1 of the 5 concurrent macOS runner slots.
- [x] Expand `e2e`'s matrix in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) from `shard: [1, 2, 3]` to `shard: [1, 2, 3, 4]` (`--shard=${{ matrix.shard }}/4`) and lower `timeout-minutes` from `30` to `15`. Total macOS jobs on a PR remain **5** (`1 gate-native + 4 e2e`), respecting the hard 5-job macOS concurrency cap with zero queueing.
- [x] Reduce `gate-node-app-test` in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) from `shard: [1, 2, 3, 4]` to `shard: [1, 2]` (`--shard=${{ matrix.shard }}/2`), saving two Ubuntu runner setups (~170s of duplicate install overhead) while keeping shard wall-clock around ~3.5–4.5 minutes.
- [x] Update the concurrency and timing comments in [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml), [`CLAUDE.md`](../../../CLAUDE.md), [`AGENTS.md`](../../../AGENTS.md), and [`GEMINI.md`](../../../GEMINI.md) to reflect the 1 `gate-native` + 4 `e2e` macOS layout.

### E — Ratchet & budget guards (`MAX_DECLARED_E2E ≤ 200`, screenshot & `waitForTimeout` bans) (S)

- [ ] In [`scripts/e2e-budget.mjs`](../../../scripts/e2e-budget.mjs), lower `MAX_DECLARED_E2E` from `480` to the new post-Theme-C count (**≤ 200**).
- [ ] Extend [`scripts/e2e-budget.mjs`](../../../scripts/e2e-budget.mjs) (and its unit tests in [`scripts/e2e-budget.test.mjs`](../../../scripts/e2e-budget.test.mjs)) with three new static invariants that run in `gate-node`:
  1. **No disk screenshots in functional E2E:** fail if any file in `packages/app/e2e/*.spec.ts` calls `.screenshot(` with a `path` option or if any `*-shots.spec.ts` file is reintroduced.
  2. **No orphaned files in `docs/screenshots/`:** fail if any image under `docs/screenshots/` is not referenced in `README.md`, `docs/*.md`, or `packages/website/`.
  3. **No un-allowlisted `waitForTimeout` in functional E2E:** fail if `waitForTimeout(` appears in `packages/app/e2e/*.spec.ts` outside a small, explicitly justified allowlist.
- [ ] Update [`docs/TESTING.md`](../../../docs/TESTING.md) and sync [`CLAUDE.md`](../../../CLAUDE.md), [`AGENTS.md`](../../../AGENTS.md), and [`GEMINI.md`](../../../GEMINI.md) to document `moon run root:test-node`, `moon run root:lint-all`, the retirement of `*-shots.spec.ts` / `MSTUDIO_SHOTS`, and the new `e2e-budget.mjs` checks.

## Files this phase touches

- [`vitest.config.ts`](../../../vitest.config.ts) / `vitest.node-gate.config.ts` — root Vitest `projects` configuration for node-portable packages.
- [`moon.yml`](../../../moon.yml) — `root:test-node`, `root:lint-all`, and `root:typecheck-node` tasks.
- [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) — consolidated `gate-node` steps, `gate-locale` folded into `gate-native`, `e2e` at 4 shards, `gate-node-app-test` at 2 shards.
- [`packages/app/playwright.config.ts`](../../../packages/app/playwright.config.ts) — remove `MSTUDIO_SHOTS` branches.
- [`packages/app/e2e/shots-helper.ts`](../../../packages/app/e2e/shots-helper.ts) — trim unused shot-writing helpers while keeping visual/functional determinism helpers.
- `packages/app/e2e/*-shots.spec.ts` (158 files) & [`packages/app/e2e/shots.spec.ts`](../../../packages/app/e2e/shots.spec.ts) — deleted.
- `docs/screenshots/**` (~1,458 unreferenced PNGs) — deleted; ~25 referenced doc images retained.
- `packages/app/e2e/*.spec.ts` — Wave C1 & C2 migrations to Vitest, inline `.screenshot()` removal, `waitForTimeout` replacement, header justifications.
- [`scripts/e2e-budget.mjs`](../../../scripts/e2e-budget.mjs) & [`scripts/e2e-budget.test.mjs`](../../../scripts/e2e-budget.test.mjs) — lowered `MAX_DECLARED_E2E ≤ 200`, disk-screenshot ban, orphaned `docs/screenshots/` check, `waitForTimeout` guard.
- [`.agents/skills/midnite-create/SKILL.md`](../../../.agents/skills/midnite-create/SKILL.md) & [`.agents/skills/midnite-create-adhoc/SKILL.md`](../../../.agents/skills/midnite-create-adhoc/SKILL.md) — ephemeral `/tmp/` PR screenshots instead of committing to `docs/screenshots/<slice>/`.
- [`docs/TESTING.md`](../../../docs/TESTING.md), [`CLAUDE.md`](../../../CLAUDE.md), [`AGENTS.md`](../../../AGENTS.md), [`GEMINI.md`](../../../GEMINI.md) — updated testing & CI conventions.

## Verification

- [ ] `moon run :typecheck :lint :test` and `moon run root:test-node root:lint-all` exit 0 locally.
- [ ] `moon run root:e2e-budget` exits 0 with `MAX_DECLARED_E2E ≤ 200`, zero `*-shots.spec.ts` files, zero disk `.screenshot({ path })` calls in `packages/app/e2e/*.spec.ts`, and zero unreferenced images in `docs/screenshots/`.
- [ ] `moon run root:tracker-check` and `moon run root:gate-projects-check` exit 0.
- [ ] `moon run app:e2e` passes green across all 4 shards on macOS CI with per-shard wall-clock time **≤ 6 minutes** (down from 13–20 minutes).
- [ ] `gate-node` completes in **≤ 3 minutes** on Ubuntu CI (down from 14m45s).
- [ ] Total PR CI wall-clock time drops from **~20m to ~5–6m**, using at most **5 concurrent macOS jobs** (`1 gate-native + 4 e2e`).

## Decisions / open questions

1. **How to eliminate the 36-package process-spawn tax in `gate-node` without breaking per-package local runs? — Resolved:** Keep `.moon/tasks/typescript.yml` per-package tasks (`moon run <pkg>:test`, `<pkg>:lint`, `<pkg>:typecheck`) untouched for focused local workflows, and add workspace-root tasks (`root:test-node` using Vitest `projects`, `root:lint-all` using `eslint . --cache`, and batched typechecking) that `ci.yml`'s `gate-node` runs in a single pass.
2. **What happens to the 1,483 PNGs in `docs/screenshots/` and the 158 `*-shots.spec.ts` files? — Resolved:** Delete all ~1,458 unreferenced PR-body PNGs (keeping only the ~25 images referenced in `README.md`, `docs/*.md`, and `packages/website/`), delete all 158 `*-shots.spec.ts` files plus `shots.spec.ts`, and strip all 48 disk-writing `.screenshot()` calls from functional E2E specs.
3. **How should `/midnite-create` and `/midnite-create-adhoc` handle visual verification screenshots going forward? — Resolved:** Save before/after screenshots to `/tmp/midnite-shots-<slice>/` and display them inline in the conversation thread; never commit PR verification PNGs to `docs/screenshots/`. Enforce this with a check in `scripts/e2e-budget.mjs`.
4. **How far should the functional E2E ratchet go? — Resolved:** Audit all 23 multi-test functional E2E specs (plus single-test pure-DOM stragglers) and migrate every non-geometry/non-canvas/non-xterm assertion to Vitest, driving `MAX_DECLARED_E2E` from `480` down to **≤ 200**.
5. **How should macOS and Ubuntu CI shards be balanced? — Resolved:** Fold `gate-locale` into `gate-native` (freeing 1 macOS slot), run `e2e` across **4 macOS shards** (`1 gate-native + 4 e2e = 5 macOS jobs`), and reduce `gate-node-app-test` from **4 Ubuntu shards to 2**.
