# Phase 82 — The pyramid, righted

CI on this repo is gated by its slowest job, and that job is the Playwright suite: **8m31s
wall, ~46 runner-minutes per PR**, eight shards deep. [Phase 56](phase-56-e2e-speed-run.md)
already spent every infrastructure lever on it — 4→8 shards, `fullyParallel`, a Vite cache,
screenshot gating — and measured the last two knobs to a standstill (`workers: 2` over 24
shard-attempts: no win; `retries: 1`: reverted, CI needs 2). [Phase 38](phase-38-e2e-suite-repair.md)
emptied the `KNOWN_RED` ratchet. The infrastructure axis is exhausted.

What is left is the *shape* of the suite, not its scheduling. The pyramid is upside down: 667
browser tests carry work that 3,701 jsdom tests do 190× cheaper, and there is no
visual-regression layer at all, so "does it still look right" is written as slow DOM
assertions against computed styles. Every one of those 667 tests boots the whole app through a
4,094-line bridge fake, and a third of the shard budget goes to screenshot specs that self-skip
in CI — the worst shard sets the wall clock for all eight.

The goal is a suite where unit tests carry the logic, a small pixel-diff layer carries the
appearance, and Playwright carries only the flows that genuinely need a browser — and a written
convention that stops it inverting again. This phase does not implement any of that; it is the
plan, verified line-by-line against the current tree, that Phase 82's themes execute against.

> **Seven findings, verified against the current tree, that this phase is built on.**
>
> **1. The measured CI baseline is 8m31s wall, and the gate job is the expensive one.** CI run
> `34394558428` (2026-09-09, a clean PR): `gate` on `macos-14` at **10× billing** ran 6m02s wall
> with a 264s test step; `e2e` shard 4/8 (`ubuntu-24.04`, 1×) ran **8m26s wall with a 441s test
> step** — the slowest job in the run; shard 3/8 ran 3m47s/160s; `db-integration` ran 1m54s.
> Per-shard e2e test seconds: 290 / 273 / 160 / **441** / 277 / 263 / 292 / 312 = **2,308s**,
> plus ~60s fixed setup × 8 shards ≈ **46 runner-minutes** for the e2e job alone. Layer cost:
> vitest/jsdom in `packages/app` runs 3,701 tests in 359 files in 66s wall (587% CPU) — **18ms
> per test** — against Playwright's 667 running (976 declared) tests in 2,308s runner —
> **3,460ms per test**, 190× the unit cost. Visual regression: zero tests.
>
> **2. Sharding is balanced by *declared* test count, and a third of it is no-ops.** 309 of 976
> declared tests are self-skipping `*-shots` specs, so the shard split treats them as full-weight
> work it never has to do. [`playwright.config.ts:35`](../../../packages/app/playwright.config.ts)'s
> `testIgnore: '**/perf/**'` does not touch them, and [`:46`](../../../packages/app/playwright.config.ts)'s
> `fullyParallel: true` schedules every declared `test()` regardless of whether its body is a
> no-op. The result: shard 3 ran ~41 real tests in 160s while shard 4 ran 122 in 441s — the
> shards are not balanced by the work they actually do, and the worst-case shard is what the gate
> waits on.
>
> **3. Every test boots the whole app, and almost none share the cost.** 453
> `page.goto`/`installMockBridge` calls across the suite, and only 4 spec files use
> `beforeEach` — nearly every spec pays a full Vite module-graph load plus a React mount before
> its one assertion. 156 `waitForTimeout` calls run suite-wide. 441s ÷ 122 tests ≈ 3.6s per test
> against the unit layer's 18ms — two hundred times the cost for tests that, per Finding 6 below,
> mostly don't need a browser at all.
>
> **4. 11 of the 47 `*-shots` files have no `MSTUDIO_SHOTS` gate at all, and run — and write PNGs
> — on every CI run.** `actions-shots`, `add-to-project-shots`, `api-client-shots`,
> `api-client-verification-shots`, `battery-shots`, `busy-spinner-shots`,
> `review-threads-shots`, `review-writes-shots`, `reviews-loading-shots`, `reviews-shots`,
> `slides-shots` — 52 tests, 48 PNG writes, on every routine run. Phase 56 Theme F gated the
> screenshot calls in 4 *functional* specs (`commit-inspector`, `files-editor`, `files-write`,
> `terminal`) and Theme G gave the other `*-shots` files a shared helper, but these eleven were
> never brought under the gate either theme established. One of them,
> [`reviews-loading-shots.spec.ts`](../../../packages/app/e2e/reviews-loading-shots.spec.ts),
> genuinely asserts `sr-only` skeleton text, so it cannot simply be `test.skip`'d wholesale —
> only its `.screenshot()` call may be gated, the same shape Theme F already used for
> `files-write.spec.ts`.
>
> **5. The 4,094-line bridge fake is Playwright-only, but only by accident.**
> [`installMockBridge`](../../../packages/app/e2e/mock-bridge.ts) is defined at
> `mock-bridge.ts:757`; the ~3,000-line builder is the `page.addInitScript((data: MockFixtures)
> => {…}, fixtures)` closure starting at
> [`mock-bridge.ts:822`](../../../packages/app/e2e/mock-bridge.ts), nested inline because that
> callback is serialised into the page and — the file's own words — "may not close over anything,
> imports included." Verified: inside the closure there is no Playwright dependency at all —
> only `window`, `localStorage`, `setTimeout`, `structuredClone`, `Proxy`, `Uint8Array`.
> `expect`/`Page` are used only by the outer wrapper and by
> [`clickRailLink`](../../../packages/app/e2e/mock-bridge.ts) at `mock-bridge.ts:4089`.
> [`fixtures.ts`](../../../packages/app/e2e/fixtures.ts) is plain data with only a type-only
> import of `MockFixtures`. So exporting the builder as a top-level `buildMockBridge(fixtures)`
> keeps it closing over nothing and therefore still serialisable by `addInitScript`'s
> `toString()` mechanism — no bundler step, no codegen, and the same fake becomes available to
> jsdom for free.
>
> **6. The unit layer has no ergonomics, which is *why* the pyramid inverted.** No shared render
> helper and no `test-utils` module exist anywhere in `packages/app`;
> [`src/vitest-setup.ts`](../../../packages/app/src/vitest-setup.ts) installs exactly one
> polyfill (`document.queryCommandSupported`). 62 test files hand-roll their own
> `QueryClientProvider`, 15 define a local `ResizeObserver` stub, 11 stub `matchMedia`, 4
> re-spy `HTMLCanvasElement.prototype.getContext`. There is no `@testing-library/user-event` and
> no `jest-dom` — a deliberate house style, plain `.textContent` assertions. Writing a unit test
> here is more work than writing an e2e one, which is precisely why so much logic ended up
> behind a browser instead.
>
> **7. `packages/app/e2e/**` is never typechecked.** [`tsconfig.json:25`](../../../packages/app/tsconfig.json)'s
> `include` is `["src/**/*", "vite.config.ts", "vitest.config.ts", "tailwind.config.ts"]` — no
> `e2e/**/*`. 29,753 lines of test code are linted (eslint's `**/*.{ts,tsx}` glob at
> [`eslint.config.mjs:55`](../../../eslint.config.mjs)) but have never seen `tsc`, so a type
> error in a spec is invisible until it fails at runtime, if it fails at all.

Visual regression is greenfield: zero matches repo-wide for `toHaveScreenshot`,
`toMatchSnapshot`, pixelmatch, argos, chromatic, percy, loki, reg-suit or odiff.
[`shots-helper.ts`](../../../packages/app/e2e/shots-helper.ts) already does most of the
determinism work a pixel-diff layer needs — a fixed `REPRODUCIBLE_ISO_DATE` (`:16`), a seeded
commit corpus via `buildReproducibleHistory` (`:62`), `stubGravatars` (`:167`), seven named
`SHOT_VIEWPORTS` (`:43`), `createShotTaker` (`:199`) — but three hazards remain open:
`font-display: swap` on `quick-kiss.ttf` ([`styles.css:29`](../../../packages/app/src/styles.css))
races first paint; `setReducedMotion` ([`shots-helper.ts:148`](../../../packages/app/e2e/shots-helper.ts))
sets only `html[data-motion]` and never calls `emulateMedia({ reducedMotion })`, so anything
gated purely on the media query still animates; and `screensaver-stage.tsx:88`'s `Math.random()`
picks unseeded copy. Cross-platform font drift has already bitten this repo once —
[Phase 38](phase-38-e2e-suite-repair.md) Theme I found rail-density specs tuned against macOS
fonts were red only on Linux CI — so any baseline corpus has to be Linux-only from the start.
And the repo carries a live size constraint: 648 PNGs / 66 MB in the working tree, with roughly
119 MiB of screenshot blobs across history — about two-thirds of the 178 MiB `.git` — with no
LFS and no `.gitattributes`.

**Taxonomy of the 667 running tests.** Sampled 34 specs / ~425 tests, weighted to the largest
files — so the A share below is if anything understated; `diagnostics`, `files-write`,
`shortcut-rail`, `settings-pages` and `stash-inspector` sampled **100% A**:

| Category | Share | Destination |
|---|---|---|
| **A** — jsdom-portable (DOM text/roles/aria, store transitions) | 55–60% (~380) | vitest |
| **B** — needs a real browser (computed CSS, `getBoundingClientRect`, pointer drag, xterm, canvas, focus order, z-order) | 28–32% (~200) | stays in Playwright |
| **C** — genuine multi-view flow | 6–8% (~45) | stays in Playwright |
| **D** — visual-only ("it looks right") | 5–7% (~40) | pixel diff |

**Target shape:**

| Layer | Now | Target |
|---|---|---|
| vitest/jsdom (`packages/app`) | 3,701 | ~4,100 |
| Playwright functional | 667 | **~245** (B + C only) |
| Visual baselines | 0 | ~100, < 3 MB |
| e2e wall clock | 8m31s | **~3m30s** |
| `gate` wall clock | 6m02s @ 10× | **~3m30s** (needs Theme H), mostly @ 1× |
| `gate` billed-minute-equiv | ~60 | **~38** (measured, Theme E) |
| Total CI wall | **8m31s** | **~4m** |

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Stop paying for no-ops (S) ✅ DONE (PRs #325, #328, 2026-09-10) — *~2 min of wall clock, one small PR*

- [x] Gate the 11 ungated `*-shots` files listed in Finding 4. Two shapes, following the Phase
      56 Theme F precedent already in the tree: a file whose tests are purely photographic gets
      `test.skip(!process.env.MSTUDIO_SHOTS, …)` — `actions-shots`, `add-to-project-shots`,
      `api-client-shots`, `api-client-verification-shots`, `battery-shots`,
      `busy-spinner-shots`, `review-threads-shots`, `review-writes-shots`, `reviews-shots`,
      `slides-shots`.
- [x] `reviews-loading-shots.spec.ts` keeps every assertion (it really does assert `sr-only`
      skeleton text) and gates only the `.screenshot()` call inline, the same shape Theme F used
      for `files-write.spec.ts`; rename it off the `*-shots` suffix so the blunt ignore rule
      below does not skip its real assertions.
- [x] In [`playwright.config.ts`](../../../packages/app/playwright.config.ts), extend
      `testIgnore` to drop `**/*-shots.spec.ts` unless `MSTUDIO_SHOTS` is set, alongside the
      existing `**/perf/**` exclusion.
- [x] Confirm the renamed `reviews-loading-shots` file is not swept by the new `*-shots`
      `testIgnore` pattern — it must keep running in every CI shard.
- [x] Re-measure `pnpm exec playwright test --list` and confirm ~667 declared tests, not 976.
- [x] Run a full CI cycle on this PR's own branch and record the per-shard times in this doc;
      the 441s straggler should land near 300s once the no-op third of its budget is gone.
- [x] `git status` after a local `pnpm e2e` run touches nothing under `docs/screenshots/`.


- [x] **Follow-up found by PR #325 — done in PR #328.** Gating the 11 `*-shots` files did *not* stop
      the working tree churning: **13 unconditional `page.screenshot()` calls survive across 7
      *functional* specs** — `graph-themes` (2), `graph-recency` (2), `phase-21-roster` (3),
      `files-view` (2), `files-search` (2), `ref-drag` (1), `settings-pages` (1) — none of them
      behind `MSTUDIO_SHOTS`. A full local suite run still dirties 19 PNGs. These are outside
      Finding 4's eleven and outside what Phase 56 Theme F swept (it fixed four *other*
      functional specs and stopped there), so the same inline-gate treatment Theme F established
      applies. Cheap, and it is what actually finishes the "a normal run leaves
      `docs/screenshots/` untouched" promise.

### B — A unit layer worth writing in (M) — *the enabler; nothing after this is expensive* ✅ DONE (PR #322, 2026-09-10)

- [x] Create `packages/app/test-support/`, added to
      [`tsconfig.json`](../../../packages/app/tsconfig.json)'s `include` so it is typechecked
      for the first time.
- [x] Move `mock-bridge.ts` and `fixtures.ts` from `e2e/` into `test-support/`. Extract the
      `addInitScript` closure (Finding 5, `mock-bridge.ts:822`) into an exported top-level
      `buildMockBridge(fixtures: MockFixtures)`. `installMockBridge` becomes
      `page.addInitScript(buildMockBridge, fixtures)`; a jsdom test gets
      `window.midniteStudio = buildMockBridge(fixtures)` directly.
- [x] Turn the closure's two init-script side effects — pinning `navigator.platform =
      'MacIntel'` and seeding the onboarding localStorage key — into two ordinary statements a
      jsdom `beforeEach` can call directly, rather than leaving them trapped inside the
      serialised function body.
- [x] Add `test-support/render.tsx`: `renderView(ui, { fixtures, uiState, queryClient })`
      wrapping `QueryClientProvider` + `DialogHost` + `ThemeProvider`, to replace the 62
      hand-rolled `QueryClientProvider` wrappers as later waves touch those files.
- [x] Promote the duplicated per-file stubs into `src/vitest-setup.ts`: `ResizeObserver`,
      `matchMedia`, `IntersectionObserver`, `HTMLCanvasElement.prototype.getContext` — deleting
      the 15 + 11 + 2 + 4 local copies as Theme C's waves touch each file, not all at once in
      this theme.
- [x] Add `test-support/module-mocks.ts`: shared `vi.mock` factories for `@monaco-editor/react`
      and `@xterm/*`, generalising the stubs already hand-written in `code-editor.test.tsx` and
      `transcript-view.test.tsx`.
- [x] Add `@testing-library/user-event` as a dependency — needed for behaviour parity with
      Playwright's keyboard/pointer interaction; `fireEvent` alone cannot carry the palette or
      menu specs' migration.
- [x] Do **not** add `@testing-library/jest-dom` — the house style is plain `.textContent`
      assertions (Finding 6) and the migration should not fork it.
- [x] Leave existing per-feature `__fixtures__` directories as they are; passing suites are not
      rewritten onto the new shared fixture just because it now exists.
- [x] **Risk gate for this theme**: `addInitScript` serialises by `toString()`, so if the TS
      build transform ever hoists a helper `buildMockBridge` closes over to module scope, the
      page injection breaks silently. It compiles clean under today's transform, so the risk is
      low, but this PR must run the **full** e2e suite green against the extracted
      `buildMockBridge` before it lands — not a single shard, the whole suite — because this is
      the one theme every later migration wave depends on.
- [x] Confirm the fake is typechecked for the first time: `moon run app:typecheck` covers
      `test-support/**` and reports zero pre-existing type errors suppressed by its previous
      exclusion from `include`.

### C — Migration waves (L) — *~380 tests, five PRs*

- [x] Wave 1 (no geometry at all): `diagnostics` (18) · `files-write` (12) · `shortcut-rail`
      (12) · `settings-pages` (8) · `search-view` (5) — ~55 tests. Mount the view with
      `renderView` + the same `MockFixtures` data, and delete the e2e test as its unit
      equivalent lands — keep exactly one e2e smoke test per view.
- [x] `search-view`'s race test wants fake timers rather than the fixture's real `delayMs` when
      it moves to vitest.
- [x] **Two harness gaps wave 1 exposed — both closed in PR #328.** Both widen what a wave can
      take, so they are cheaper now than repeated per-spec workarounds later.
      (a) `test-support/fixtures.ts` exports `fixtures` as a shared **constant**. Playwright
      hands every test a fresh `page`, so a fixture object mutated by a write is re-created for
      free; a jsdom test has no such isolation and the mutation leaks to the next test in the
      file. Wave 1 worked around it per-spec — it wants a `makeFixtures()` factory instead.
      (b) `src/vitest-setup.ts`'s global `ResizeObserver` stub never **fires**, so
      `@tanstack/react-virtual` measures nothing and renders no rows. That is why
      `search-view`'s "each mode renders its own results" stayed in Playwright, and it will
      block every virtualised surface in waves 2-5 (`results-grid`, `projects-view`,
      `board-view`, `graph-view`, `diff-view`, `log-pane`, `companion-thread`, `palette`).
      A stub that invokes its callback once on observe, with a settable content rect, unblocks
      them.
- [x] Wave 2 (PR #333): `commit-inspector` 19→4 · `changes-panel` 17→3 · `diff-view` 12→3. e2e declared 654→**617**, `app:test` 3,818→**3,873**. `changes-panel`'s tree-grouping and totals assertions merged **into** the existing `change-tree.test.tsx` rather than a third copy, as this theme requires.
      `changes-panel`'s tree-grouping assertions already have partial unit coverage in
      `build-change-tree.test.ts` and should merge into that file rather than duplicate a
      second suite.
- [ ] **A systematic jsdom trap wave 2 hit, to apply from wave 3 on.** A component behind a
      `React.lazy` boundary whose chunk pulls in a heavy ESM dependency makes a migrated test
      `await` a **compiler, not a render**. Wave 2's `commit-detail.bridge.test.tsx` and
      `diff-view.bridge.test.tsx` both awaited `commit-message` — `React.lazy`-loaded to keep
      `react-markdown` and `remark-gfm` out of the entry chunk — and both **passed when
      `app:test` ran alone and failed under a real `moon run :typecheck :lint :test`**, where
      every package's suite runs in parallel and the first-resolve ESM transform exceeds the
      poll ceiling. That reads exactly like load flake and is not. Raising the ceiling only
      moves the race, and a wall-clock bound in a unit test is the same shape as the false reds
      in this theme's own flake register and the vacuous 2s bound #310 deleted. The fix is
      `beforeAll(async () => { await import('<the lazy module>'); })` — it resolves the chunk
      into vitest's module cache so `React.lazy` settles from cache, weakens no assertion, and
      leaves the test still awaiting the (genuinely async) render. **Waves 3-5 will hit this
      again**: `palette`, `companion-thread` and several diff/editor surfaces sit behind lazy
      boundaries. Write the pattern into `test-support/` guidance so it is applied rather than
      rediscovered per wave.
- [x] Wave 3 (PR #334): `actions-view` 15→2 · `optimizer` 14→2 · `review-writes` 13→1. e2e declared 619→**582**, `app:test` 3,884→**3,922**. The lazy-chunk warm-up was checked and **not needed**, with a reason: wave 2's trap was `CommitMessage`'s own internal `lazy()` boundary, and none of these three views has one — the outer view registry lazy-loads the *view*, which mounting the component directly bypasses, and `PrDetail`'s `react-markdown` is a plain static import.
- [ ] **A porting hazard wave 3 found, to expect in every remaining wave.** Testing Library's
      `getByRole`/`getByText` default to a **whole-string** match; Playwright's default is
      **substring**. So an assertion ported verbatim from an e2e spec fails with "unable to find
      an element" — which reads as a render or timing problem and is actually a matcher
      mismatch. Several of wave 3's ported assertions needed a regex or an exact-string tweak.
      Check the matcher before debugging the render.
- [ ] Wave 4: `palette` (13) · `repos-workbench` (13) · `companion-panel` (11) · `nav-shell` (8)
      — ~45 tests.
- [ ] Wave 5: the tail of ~100 smaller specs that sampled 100% category A — ~200 tests.
- [ ] Per wave, diff the assertion list in the PR body: the migrated unit tests must assert what
      the deleted e2e tests asserted, not a weaker stand-in.
- [ ] Any geometry straggler found mid-wave (a spec that turns out to lean on real layout or
      CSS) stays in Playwright — that is a normal outcome of the migration, not a failure to fix.
- [ ] Confirm the following stay in Playwright and are **not** touched by any wave: `terminal`
      (real xterm + ANSI), `fab-loops`'s ~17 glow/arc tests (real conic-gradient/mask
      resolution — the spec's own comment argues a pixel diff cannot catch that class of bug),
      `graph-themes` (SVG leader-line `boundingBox`), `kanban` / `ref-drag` / `panel-snap`
      (pointer drag), `project-graph` and `workflows`'s canvas half, `browser-pane`'s
      layout/tween subset, `titlebar-agents`'s width-shedding subset, `overlay-stacking` (paint
      order), `focus-return` (real tab order), `database-query-flow` (the one genuine journey).
- [ ] After each wave, confirm `app:test` count rises by roughly the number of e2e tests removed
      and e2e wall clock falls measurably on that PR's own CI run.

### D — A pixel-diff layer (M) ◐ MOSTLY DONE (PR #335, 2026-09-10)

- [x] Add `playwright.visual.config.ts` and a `moon run app:visual` task
      ([`moon.yml`](../../../packages/app/moon.yml)), `testDir: e2e/visual`.
- [x] Determinism first, extending [`shots-helper.ts`](../../../packages/app/e2e/shots-helper.ts):
      `await document.fonts.ready` before any capture (closes the `font-display: swap` race at
      `styles.css:29`); `emulateMedia({ reducedMotion: 'reduce' })` *alongside* the existing
      `data-motion` attribute set by `setReducedMotion`; freeze `Date` to the existing
      `REPRODUCIBLE_ISO_DATE`; seed `screensaver-stage.tsx:88`'s RNG. `stubGravatars` and
      `mockWeatherApi` are already in place and need no change.
- [x] Use `toHaveScreenshot({ maxDiffPixelRatio: 0.002 })` on `locator` crops, **never** full
      pages — a component crop is ~10–20 KB against a full page's ~100 KB, and the repo cannot
      absorb another uncontrolled corpus on top of the existing 66 MB.
- [x] Seed the baseline corpus from what already exists: the ~40 category-D assertions plus the
      48 images the 11 newly-gated files produce today.
- [x] Cap the corpus at **~100 baselines / 3 MB**, enforced by a check added to the same script
      Theme F introduces for the e2e budget.
- [x] Store baselines under `e2e/visual/__screenshots__/`, with `snapshotPathTemplate` carrying
      `{platform}` so only `linux` baselines ever exist in the tree.
- [x] CI asserts against the baselines on the existing ubuntu runner; document the dev
      regeneration path through the official image so local (non-Linux) machines never write a
      baseline CI will reject:
      `docker run --rm -v "$PWD:/w" -w /w mcr.microsoft.com/playwright:v1.62.1-noble npx playwright test --config packages/app/playwright.visual.config.ts -u`.
- [x] Upload the diff artifact `if: failure()`, matching the pattern the e2e job already uses
      for traces.
- [x] Retire the byte-reproducibility item in
      [`outstanding.md`](../outstanding.md) — this layer compares decoded pixels rather than
      file bytes, which is exactly the fix that entry names.
- [x] Confirm `moon run app:visual` is green twice in a row on the same tree (proves
      determinism) and that one deliberate CSS change makes it fail with a readable diff.


- [ ] **The corpus is a first slice, not the target set.** PR #335 committed **10 baselines /
      184 KB** against the ~100 / 3 MB cap, seeded from the five components it could verify with
      high confidence (screensaver word, palette swatches, battery tiers, status bar, kanban
      glow), reusing proven `*-shots.spec.ts` fixtures. The phase names ~40 category-D
      assertions — colour, glow, opacity, theme-token and spacing checks still written as slow
      computed-style DOM assertions in the e2e suite. The remaining ~30 are the point of the
      theme: each one converted is an e2e test deleted. `scripts/visual-budget.mjs` enforces the
      cap, so the corpus cannot grow silently.
### E — Split the gate (M) ✅ DONE (PR #321, 2026-09-10)

- [x] Measure per-package test time first — `shared:test`, `git-engine:test`, `desktop:test`,
      `app:test`, `db-engine:test`, `website:test` — and record the real numbers in this doc
      before splitting anything. **Measured** locally, isolated, `MOON_CACHE=off --force` (the
      machine had concurrent sessions, so treat as order-of-magnitude): shared ~15s ·
      db-engine ~20s · desktop ~37s · website ~45s · git-engine ~75s (incl. its `shared:build`
      dep) · **app ~4m**. `app` alone is about two-thirds of the old gate's 264s test step.
- [x] Split [`ci.yml`](../../../.github/workflows/ci.yml)'s `gate` job (currently `macos-14`,
      6m02s/264s at 10× billing) into `gate-node` (**ubuntu-24.04**: shared, app, website,
      db-engine) and `gate-native` (**macos-14**: git-engine, desktop — the only two packages
      that need dugite's bundled git and node-pty). Both block merge.
- [x] Confirm the ~400 unit tests this phase adds land on the 1× `gate-node` runner, not the 10×
      `gate-native` one. `app` is in `NODE_PROJECTS`, and
      [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs) — a new
      `Package split guard` step in `gate-node`, covered by its own test under `root:test` —
      fails the build if any `packages/*` directory is claimed by neither lane, by both, or if
      a list entry names a directory that no longer exists.
- [x] Record both jobs' wall clock from a real CI run in this doc. **PR #321's own run**
      ([34413452055](https://github.com/bilo-io/midnite-studio/actions/runs/34413452055)),
      both green: `gate-node` **341s** (261s test step) on ubuntu at 1×; `gate-native`
      **193s** on macos-14 at 10×. They run in parallel, so the critical path is 341s ≈ 5m41s
      against the single gate's 6m02s.

      **This theme did not do what the phase predicted, and the number is why Theme H exists.**
      The target table above originally said 6m02s → ~3m30s. The real result is 6m02s → 5m41s:
      `gate-node`'s 261s test step is within three seconds of the undivided gate's 264s, because
      ubuntu's slower cores gave back almost exactly what removing `git-engine` and `desktop`
      saved. What the split *does* buy is billing — ~60 billed-minute-equivalents down to ~38,
      about 37% — and every future test in the four node-portable packages compounding at 1×
      rather than 10×. That is worth having on its own, but it is not a wall-clock win, and
      Theme C is about to add ~400 tests to `app`, which is ~180s of that 261s. Recorded here
      rather than only in the PR, on the Phase 56 Theme C/D precedent for measured
      non-adoptions.

### F — Write the convention down, and ratchet it (S)

- [ ] Add `docs/TESTING.md`: the three layers, the decision rule (a new test is a vitest test
      unless it needs real layout, real CSS, pointer coordinates, xterm, canvas, focus order or
      paint order — name which, in the spec's own header comment), how to run each layer, and
      how to regenerate visual baselines (the Theme D docker command).
- [ ] Add the same paragraph to all three of `CLAUDE.md`, `AGENTS.md` and `GEMINI.md`, per the
      repo's standing three-file sync rule.
- [ ] Add `scripts/e2e-budget.mjs`, wired into the gate: fails if `e2e/*.spec.ts` declares more
      than a committed ratchet number of tests, or if the visual baseline corpus exceeds its
      cap. Lowering the ratchet number is a deliberate commit; raising it needs a sentence
      explaining why — matching the ratchet culture Phase 38 established for `KNOWN_RED` and
      then retired once it emptied out.
- [ ] Add `e2e/**` to [`tsconfig.json`](../../../packages/app/tsconfig.json)'s `include`
      (Finding 7) so the suite is typechecked for the first time — expect a batch of first-time
      errors surfacing on 29,753 lines that have never seen `tsc`; that is the point of the
      change, not a regression to work around.
- [ ] Confirm `scripts/e2e-budget.mjs` fails on a deliberately added throwaway spec, then remove
      the throwaway spec.

- [ ] **A flake register, and a guard against the class that causes it.** Measured across this
      phase's own merges on 2026-09-09/10: **four distinct specs failed CI on PRs that could not
      have caused them**, each costing a diagnosis plus a re-run before the PR could be trusted.
      `desktop/src/mcp-shim/shim.test.ts` (twice — a 2s wall-clock bound, observed at 3746ms
      under load; PR #310 already fixes it), `desktop/src/broker/server.test.ts` (pty staleness
      timing), `e2e/titlebar-agents.spec.ts` (CSS `animation-name` timing — already the reason
      `playwright.config.ts` keeps `retries: 2`), and `e2e/notes.spec.ts`'s browser-occluder
      contract (**six times — #324, #327, #331, #333 and #335 twice — and it is **not** flake. Diagnosed 2026-09-10: the test alone passes in 6.6s and the whole file passes 8/8 under `--workers=1`, but the file under parallel workers fails, and it reproduces identically on clean `main`. Its `expect.poll` on the WebContentsView visibility sync simply loses the race whenever the environment is slow or contended — locally under parallel workers, on CI under the 2-core runner. A real, fixable defect, not noise, and the single largest tax on this repo's CI trust) — #324, #327, #331 and #333, always the same
      `__mstudioBrowserVisibleCalls` poll, and now the most persistent flake in the suite; it has
      earned a real fix rather than another re-run).

      **Two more, found landing #309 on 2026-09-10 — the count is six specs, not four.**
      `packages/app/src/services/avatars.test.ts` (a cache-state race, `pending` observed where
      `ready` was asserted) failed `gate-node-app-test` shard 4 and passed on a `gh run rerun
      --job`; `run-detail.test.tsx` threw an unhandled post-teardown `window is not defined`
      under a full parallel `moon run :typecheck :lint :test` and passed on a solo `app:test`
      (3922/3922). #309's diff touches only `packages/desktop/scripts/lib/`, so neither can be
      its fault. Both are the *same shape* as the register's existing entries — state or
      lifecycle that only races when the suite is contended — and neither is a wall-clock bound,
      so the check this theme proposes would **not** have caught either. Worth noting before
      writing it: the guard against `expect(elapsed).toBeLessThan(…)` covers three of the
      original four and none of these two. The post-teardown class in particular wants a
      different guard — an `afterEach` that fails a test leaking a timer or subscription past its
      own teardown.

      Two of
      those PRs touched **zero** files in the failing package. This phase makes CI faster; flake
      makes it less *trustworthy*, and trust is what a blocking gate actually sells — a gate that
      is red on nobody's fault is a gate that gets switched off, which `ci.yml`'s own comment
      already argues. So: name the known-flaky specs in one place with the evidence, and add a
      lint rule or `scripts/` check that fails a **wall-clock-bound assertion in a unit test**
      (`expect(elapsed).toBeLessThan(…)` and friends), which is the shape behind three of the
      four. Cheaper than re-diagnosing each one per PR.

### G — Re-measure and re-tune the shards (S)

- [ ] With ~245 e2e tests remaining after Theme C, re-measure per-shard wall clock rather than
      inheriting the existing 8-shard split — the fixed ~60s setup per shard becomes a large
      fraction of each job once the suite itself shrinks.
- [ ] Pick the shard count from the re-measured data, the same way Phase 56 picked 8 from its
      own measurements rather than guessing.
- [ ] Record the new per-shard numbers and the chosen shard count in this doc, so the next
      person does not have to re-derive them.
- [ ] Confirm total CI wall clock against the ~4 min target, from a real run on `main`, against
      the 8m31s baseline recorded above.

### H — Shard the unit suite too (S) ✅ DONE (PR #327, 2026-09-10)

Theme E's own CI run disproved this phase's original assumption that splitting the gate by
platform would halve its wall clock. It did not. `gate-node` came back at **341s with a 261s
test step** — against the single `gate`'s 264s — because ubuntu's slower cores cancelled out
the smaller workload almost exactly. The split's real win is billing (~60 → ~38
billed-minute-equivalents) and headroom at 1×, not time. See Theme E's measurements.

That leaves `app:test` as the floor: roughly 180s of `gate-node`'s 261s, on a 2-core runner,
for 3,701 tests that take 66s on a 12-core laptop. **Theme C makes it worse, not better** — it
adds ~400 tests to exactly that suite. Without this theme, the pyramid work moves cost from the
e2e lane into the gate lane and the ~4 min total stays out of reach.

`vitest --shard <index>/<count>` exists (confirmed on vitest 3.2.7, the pinned version), so the
fix is the same one Phase 56 applied to Playwright.

- [x] Measure `app:test` in isolation on an `ubuntu-24.04` runner to confirm it is the dominant
      term in `gate-node`'s 261s step, rather than inferring it from the local per-package
      numbers Theme E recorded under contention.
- [x] Shard `app:test` in [`ci.yml`](../../../.github/workflows/ci.yml) with
      `vitest --shard=${{ matrix.shard }}/N`, choosing N from that measurement rather than
      copying e2e's 8 — the fixed ~60s setup per shard is the same tax here, and this suite is
      far cheaper per test.
- [x] Keep the other node-portable packages (`shared`, `db-engine`, `website` — ~80s combined)
      unsharded in a single job; sharding them would be all setup and no work.
- [x] Re-run [`scripts/gate-projects-check.mjs`](../../../scripts/gate-projects-check.mjs)
      (Theme E's drift guard) against the new job shape so a package still cannot belong to
      neither lane.
- [x] Re-measure after Theme C has landed its ~400 new unit tests, and record the number here —
      this theme's whole justification is that the suite is about to grow.
- [x] Confirm `moon run :typecheck :lint :test` locally is untouched by the change; sharding is
      a CI concern, and the local command must stay the one `CLAUDE.md` advertises.

## Files this phase touches

- [`packages/app/e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts) — the extraction
  at `:822` that unlocks Theme C; moves to `test-support/`.
- [`packages/app/e2e/fixtures.ts`](../../../packages/app/e2e/fixtures.ts) — already plain data;
  moves with it.
- [`packages/app/e2e/shots-helper.ts`](../../../packages/app/e2e/shots-helper.ts) — extended for
  visual-layer determinism; reuses `REPRODUCIBLE_ISO_DATE`, `stubGravatars`, `SHOT_VIEWPORTS`,
  `createShotTaker`.
- [`packages/app/playwright.config.ts`](../../../packages/app/playwright.config.ts) —
  `testIgnore` extended to drop ungated `*-shots` specs.
- [`packages/app/vitest.config.ts`](../../../packages/app/vitest.config.ts) and
  [`packages/app/src/vitest-setup.ts`](../../../packages/app/src/vitest-setup.ts) — new global
  stubs promoted from per-file duplicates.
- [`packages/app/tsconfig.json`](../../../packages/app/tsconfig.json) — `include` gains
  `test-support/**/*` (Theme B) and `e2e/**/*` (Theme F).
- [`packages/app/moon.yml`](../../../packages/app/moon.yml) — new `visual` task beside `e2e`/`perf`.
- [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) — gate split into
  `gate-node`/`gate-native`, a visual job, the re-tuned shard count.
- `packages/app/test-support/{mock-bridge,fixtures,render,module-mocks}.ts` — new.
- `docs/TESTING.md`, `scripts/e2e-budget.mjs` — new.
- `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.midnite/tasks/_INDEX.md`, `.midnite/tasks/done.md`,
  [`.midnite/tasks/outstanding.md`](../outstanding.md) (byte-reproducibility item retired).

## Verification

- [ ] `moon run :typecheck :lint :test` green at every theme boundary.
- [ ] **Theme A**: `pnpm exec playwright test --list` shows ~667 declared, not 976; a full CI
      run records per-shard times in this doc; `git status` after a local run touches nothing in
      `docs/screenshots/`.
- [ ] **Theme B**: the *unchanged* e2e suite runs green against the extracted `buildMockBridge` —
      this is the gate on the whole refactor, and must be a full run, not a shard.
- [ ] **Theme C**, per wave: the migrated unit tests assert what the deleted e2e tests asserted
      (diffed in the PR body); `app:test` count rises by roughly the number of e2e tests removed;
      e2e wall clock falls measurably on that PR's own CI run.
- [ ] **Theme D**: `moon run app:visual` green twice in a row on the same tree (proves
      determinism); one deliberate CSS change makes it fail with a readable diff artifact;
      baseline corpus stays under the committed cap.
- [ ] **Theme E**: both gate jobs green; recorded wall clock for each in this doc.
- [ ] **Theme F**: `scripts/e2e-budget.mjs` fails on a deliberately added throwaway spec.
- [ ] **End state**: total CI wall clock ≤ ~4 min, recorded from a real run on `main`, against
      the 8m31s baseline in this document.

## Not in this phase

- Shrinking the existing `docs/screenshots/` history — the ~119 MiB of screenshot blobs already
  in git history is a separate, history-rewriting decision, not something this phase touches.
- An external visual-diff service (Argos, Chromatic, Percy, and similar) — see Decision 2.
- Adding `@testing-library/jest-dom` — the house style stays plain `.textContent` assertions.
- Touching the assertions of any category-B or category-C spec. This phase moves category-A
  tests to vitest and adds a category-D visual layer; it does not rewrite what the tests that
  stay in Playwright check.

## Decisions / open questions

1. **Full pyramid in one phase, rather than quick-wins-only or migration-without-visual.**
   *Settled: the full seven-theme plan.* A quick-wins-only cut (Theme A alone) leaves the
   inversion in place and the suite re-grows into it, the way it already grew past Phase 56's
   infrastructure fixes. Migration without a visual layer (Themes A–C, F–G, skipping D) would
   delete real coverage — the ~40 category-D "does it still look right" assertions have nowhere
   to land, and the repo has never had a pixel-diff layer to catch what a jsdom test structurally
   cannot. The full plan costs more up front (Theme C alone is an L) but is the only version that
   both shrinks the suite and does not lose what it currently checks.
2. **Playwright `toHaveScreenshot` with component-scoped in-repo baselines, rather than
   LFS/external storage or a hosted service.** *Settled: in-repo, capped, component crops.*
   LFS/external storage was rejected because the repo has neither today and introducing either
   for ~100 small crops is more infrastructure than the corpus justifies. A hosted service
   (Argos, Chromatic) was rejected on two grounds: this is a private repo, so a per-snapshot
   paid service is an ongoing cost for a corpus this small, and every one of those services
   requires rendering (or re-rendering) pages against a third-party's infrastructure — an egress
   and trust boundary this repo has not needed for anything else it tests. Locator crops plus a
   hard 100-baseline/3 MB cap keep the in-repo cost bounded without either alternative.
3. **Include the gate split (Theme E) in this phase, rather than deferring it.** *Settled:
   include it.* Deferring it was considered — Themes A–D and F–G land real wins on their own —
   but without the split, the whole exercise bottoms out at the `gate` job's own ~6 min ceiling
   regardless of how much the e2e side shrinks, and the ~400 new unit tests Theme B/C add would
   land on the 10× `macos-14` runner rather than the 1× one they belong on. Splitting the gate is
   what lets the e2e wins actually reach the total-wall-clock number in the target-shape table.
4. **Worktree over the primary checkout.** *Settled, per the repo's standing rule*: default is a
   worktree (`.worktrees/phase82-pyramid` on `feature/phase82-pyramid`) unless the user says
   otherwise, so a parallel session working in the primary checkout is never disturbed by this
   phase's own commits.
5. **Open, for a human: can `retries` finally come down from 2 to 1 in CI once the suite is
   smaller and faster?** Phase 56 Theme D tried the trim once already and reverted it — one
   retry was not enough margin for `titlebar-agents.spec.ts`'s reduced-motion test even on the
   suite as it existed then. Whether a smaller, faster suite changes that margin is not
   something this phase measures; it is left as the standing evidence that the trim needs a
   fresh CI data set before it is tried again, not a fresh assumption that a smaller suite fixes
   the flake on its own.
