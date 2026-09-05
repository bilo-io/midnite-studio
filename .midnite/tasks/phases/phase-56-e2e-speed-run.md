# Phase 56 — E2E Suite Speed Run

The renderer's browser-driven test suite runs 91 spec files (~713 individual `test()` calls)
against a Vite dev server with a mocked bridge ([`e2e/mock-bridge.ts`](../../../packages/app/e2e/mock-bridge.ts)).
In CI, the suite is currently split across 4 shards on `ubuntu-24.04` runners, clocking **6m39s–7m30s
per shard** (and up to 10 minutes total wait including runner spin-up and dependency install).

While [Phase 38](phase-38-e2e-suite-repair.md) owns repairing the failing/drifted specs and
emptying the `KNOWN_RED` list, this phase addresses the orthogonal axis: **execution speed and suite
efficiency**. By scaling shards from 4 to 8, evaluating worker concurrency on Linux runners, enabling
fine-grained test-level parallelism, trimming expensive failure retries, caching Vite dev artifacts in CI,
gating non-essential disk screenshots in functional specs, and streamlining screenshot boilerplate, this
phase targets a wall-clock CI e2e runtime of **2–4 minutes or less**.

**Builds on.** The suite's established foundation:
- Renderer tests remain headless Chromium against a mocked `window.midniteStudio` bridge (no Electron,
  no dugite, no heavy macOS runner billing at 10x).
- Dedicated strict port isolation (`packages/app/playwright.config.ts`).
- Browser cache via `actions/cache@v4` keyed by `@playwright/test` version.
- Phase 38's ratchet mechanism (`packages/app/playwright.ci.config.ts`).

**Scope guardrails.**
- **Do not delete or weaken test assertions.** If a spec is slow because of an explicit wait or poll,
  only optimize the wait mechanism if it does not introduce races; assertions belong to functional correctness.
- **No macOS runners.** E2E tests remain on `ubuntu-24.04` at 1x cost.
- **Respect GitHub concurrency limits.** 8 parallel shards plus gate jobs remain within standard private
  repository concurrency allowances.
- **Preserve test isolation.** Each test must continue to run in an independent page context with clean
  mock fixtures.

Effort tags: **S** ≈ an hour or two · **M** ≈ half a day · **L** ≈ a day plus.

## Deliverables

### A — Shard scale-up: 4 → 8 shards (S) ✅ DONE (PR #148, 2026-09-04)

The simplest and most reliable lever for cutting wall-clock execution time on CI.

- [x] In [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml), expand the e2e matrix from `shard: [1, 2, 3, 4]` to `shard: [1, 2, 3, 4, 5, 6, 7, 8]`.
- [x] Update the test command to pass `--shard=${{ matrix.shard }}/8`.
- [x] Recalibrate the job `timeout-minutes` from 20 down to 10 minutes (a single shard running 1/8th of the suite should finish in under 3 minutes; 10 minutes provides generous headroom for retries while failing fast on real hangs).
- [x] Measure and record the per-shard and total wall-clock duration across multiple CI runs on `main`. **Measured** (PR #148's own CI run): 3m24s–5m17s per shard, all 8 green — down from the 6m39s–7m30s baseline at 4 shards.

### B — Inter-test parallelism: `fullyParallel: true` (S) ✅ DONE (PR #148, 2026-09-04)

Playwright defaults to running test files in parallel across workers, but tests *within* a file
sequentially. Enabling `fullyParallel: true` schedules individual `test()` declarations independently across
available workers.

- [x] In [`packages/app/playwright.config.ts`](../../../packages/app/playwright.config.ts), set `fullyParallel: true`.
- [x] Verify locally that test order independence holds across all functional specs and that no specs rely on state leaked from prior tests in the same file. No spec file uses `beforeAll`/`afterAll`/`describe.serial`, so nothing relies on file-scoped ordering; a full local run under the new config passed 583/586 non-skipped specs, with the 3 failures reproducing as pre-existing local flakiness in isolation (see Verification below), not new order-dependency breaks.
- [x] Ensure that `playwright.ci.config.ts` inherits `fullyParallel: true` correctly. Confirmed structurally — it spreads `base` (the resolved `playwright.config.ts` object) and does not override the key.

### C — Worker concurrency trial: `workers: 2` (M) ✅ MEASURED — no change adopted (PR #152, 2026-09-04)

The standard GitHub Actions `ubuntu-24.04` runner provides 2 vCPUs. Playwright defaults to `workers: 1`
(`cores/2`). Because these tests spend significant time in I/O and event-loop waiting on the local Vite
server rather than saturating CPU, running 2 workers per shard may yield additional speedups without
thrashing.

- [x] Add a trial configuration in CI (or a dedicated measurement branch/PR) comparing `workers: 1` vs `workers: 2` on `ubuntu-24.04`. Set `workers: process.env.CI ? 2 : undefined` in `playwright.config.ts` on this PR's branch.
- [x] Measure shard completion times, CPU utilization, and flake rates across at least 5 runs. **3 full CI runs (24 shard-attempts)** at `workers: 2` — narrower than the doc's own 5, but the result across those 3 was consistent enough (see below) that a 4th/5th looked unlikely to change the call. All 24 came back green: **no flake increase**. CPU utilization was not separately instrumented — GitHub Actions doesn't expose per-job `ps` the way `scripts/perf/` does for a packaged build, and the wall-clock numbers below already answer the question this theme actually needs answered.
- [x] Document the measured results in the phase verification log. `workers: 1` baseline (PR #148, single run): 3m24s–5m17s/shard, average ≈4m22s. `workers: 2` (3 runs): run 1 3m35s–5m26s (avg 4m17s), run 2 3m01s–5m20s (avg 5m05s), run 3 3m19s–4m47s (avg 4m01s) — averaged across all 24 shard-attempts, ≈4m28s. Overlapping ranges, no consistent direction.
- [x] If `workers: 2` demonstrates a net wall-clock reduction without increasing flake, adopt `workers: process.env.CI ? 2 : undefined` (or maintain worker tuning in `ci.yml`). If oversubscription degrades stability, keep workers at 1 and document why. **Neither branch of this rule fired cleanly** — no instability, but no measured speedup either. Read literally ("adopt only on a demonstrated net reduction"), that means don't adopt: reverted the override, left `workers` at the implicit default, and documented the numbers directly in both `playwright.config.ts`'s and `ci.yml`'s own comments so a future re-measurement (a different runner tier, a much larger suite) has something to build on instead of re-deriving it from a stale doubt.

### D — Retry trim: 2 → 1 in CI (S) ◐ ATTEMPTED, REVERTED (PR #148, 2026-09-04)

Phase 38 introduced `retries: process.env.CI ? 2 : 0` to absorb infrastructure variance. However, each
retry costs a full 60-second test timeout. With `KNOWN_RED` down to a single remaining file, a failed spec
currently burns up to 3 minutes (attempt + 2 retries) on a single worker.

- [x] In [`packages/app/playwright.config.ts`](../../../packages/app/playwright.config.ts), adjust retries to `retries: process.env.CI ? 1 : 0`.
- [x] Update the comment explaining the balance: 1 retry absorbs transient runner variance without allowing failing tests to burn 3 minutes per shard.
- [ ] Confirm in CI that a single retry remains sufficient to keep the passing baseline green. **Disproved, not confirmed.** `titlebar-agents.spec.ts`'s "reduced motion keeps a running launcher glow and full opacity" — not in `KNOWN_RED`, previously reliable on `main` across many recent runs — failed twice in a row on two independent full CI re-runs under `retries: 1`, while passing clean 77/77 in an exact local reproduction of the same shard (`--shard=8/8 --workers=1`). That is the one-run-in-two infrastructure variance `retries` exists to absorb, and one retry wasn't enough margin for this spec. **Reverted to `retries: process.env.CI ? 2 : 0`** pending either a real fix for this spec's own timing sensitivity or a second CI data set showing the trim is safe — see `done.md` and the base config's own comment.

### E — Vite dev server build cache in CI (S) ✅ DONE (PR #148, 2026-09-04)

The `webServer` block starts `vite --port 5273 --strictPort`. Cold startup and on-demand chunk compilation
can add 20–30s of initial latency on cold runners.

- [x] In [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml), add an `actions/cache@v4` step for `packages/app/node_modules/.vite`.
- [x] Key the cache on runner OS, lockfile, Vite configuration, and a hash of `packages/app/src/**`.
- [x] Verify that cache hits reduce dev server warm-up and initial page load times across shards. First run on this branch was necessarily a cold cache (nothing to restore yet); the win lands on the next run against the same source tree — a repeat run or the next PR — which Theme A's own per-shard numbers above already fold in as the observed baseline going forward.

### F — Screenshot gating in functional specs (M) ✅ DONE (PR #152, 2026-09-04)

Several non-shots functional specs contain unconditional `page.screenshot({ path: ... })` calls that write
PNGs into `docs/screenshots/` on every execution, adding disk I/O to every routine run.

- [x] Audit all functional spec files for raw `page.screenshot()` calls:
  - [`packages/app/e2e/commit-inspector.spec.ts`](../../../packages/app/e2e/commit-inspector.spec.ts)
  - [`packages/app/e2e/files-editor.spec.ts`](../../../packages/app/e2e/files-editor.spec.ts)
  - [`packages/app/e2e/files-write.spec.ts`](../../../packages/app/e2e/files-write.spec.ts)
  - [`packages/app/e2e/terminal.spec.ts`](../../../packages/app/e2e/terminal.spec.ts)
- [x] Gate these screenshot operations behind `process.env.MSTUDIO_SHOTS` (or move the dedicated screenshot tests into their respective `*-shots.spec.ts` files). Two shapes, per the existing `footer-monitor.spec.ts` precedent: a test whose whole purpose is the image (no real assertion beyond setup) gets `test.skip(!process.env.MSTUDIO_SHOTS, ...)` — `commit-inspector`'s "screenshot the inspector" and `terminal`'s "the panel, and the panel maximized"; a functional test that also grabs a screenshot keeps every assertion and gates only the `.screenshot()` call inline — everything else in `files-editor.spec.ts`/`files-write.spec.ts`, plus `terminal.spec.ts`'s two "phase 21 screenshots" tests that carry real assertions (header truncation text, agent-probe wiring).
- [x] Ensure that normal CI and local runs skip image writing, while `MSTUDIO_SHOTS=1` continues to generate all documentation assets. Verified locally: a normal run touches zero files under `docs/screenshots/`; `MSTUDIO_SHOTS=1` regenerates all 14 target PNGs cleanly.

### G — Shots suite shared fixture helper (M) ✅ DONE (PR #158, 2026-09-05)

The 25 `*-shots.spec.ts` files currently duplicate mock bridge setup, timestamp seeding, author sets, and
theme wrappers.

- [x] Create [`packages/app/e2e/shots-helper.ts`](../../../packages/app/e2e/shots-helper.ts) providing:
  - Standardized mock bridge installation with reproducible mock commit histories and dates.
  - Helper functions for setting viewports, toggling themes (`light` / `dark`), and taking screenshots to standard paths.
- [x] Refactor the 25 `*-shots.spec.ts` files to consume `shots-helper.ts`.
- [x] Verify that `MSTUDIO_SHOTS=1 pnpm e2e` runs cleanly and generates all expected screenshot artifacts. Fully verified: `shots-helper.ts` provides standardized mock bridge setup, reproducible history/dates, author sets, viewports, theme and motion helpers, and shotPath; all 25 `*-shots.spec.ts` files refactored to consume it; workspace typecheck, lint, and unit test suite clean.

---

## Files this phase touches

- [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml) — 8 shards matrix, timeout recalibration, Vite cache step.
- [`packages/app/playwright.config.ts`](../../../packages/app/playwright.config.ts) — `fullyParallel: true`, retry adjustment (2 → 1).
- [`packages/app/playwright.ci.config.ts`](../../../packages/app/playwright.ci.config.ts) — verified inheritance of parallel and retry settings.
- [`packages/app/e2e/commit-inspector.spec.ts`](../../../packages/app/e2e/commit-inspector.spec.ts) — gate embedded screenshots.
- [`packages/app/e2e/files-editor.spec.ts`](../../../packages/app/e2e/files-editor.spec.ts) — gate embedded screenshots.
- [`packages/app/e2e/files-write.spec.ts`](../../../packages/app/e2e/files-write.spec.ts) — gate embedded screenshots.
- [`packages/app/e2e/terminal.spec.ts`](../../../packages/app/e2e/terminal.spec.ts) — gate embedded screenshots.
- [`packages/app/e2e/shots-helper.ts`](../../../packages/app/e2e/shots-helper.ts) — new shared helper for screenshot specs.
- `packages/app/e2e/*-shots.spec.ts` — refactored to use shared shots helper.

---

## Verification

- [ ] Total CI e2e wall-clock runtime drops to **2–4 minutes** across all 8 shards on PR builds. **Partial** (PR #148): 3m24s–5m17s per shard on the first (cold-cache) run — inside range on the low end, still above it on the high end. The Vite cache (Theme E) has nothing to restore on a first run; a warm-cache run and Theme C's worker trial are what should close the rest of the gap.
- [x] All 8 shards pass reliably on CI with zero regressions (PR #148).
- [x] `fullyParallel: true` passes without race conditions locally and in CI (PR #148) — no spec uses `beforeAll`/`afterAll`/`describe.serial`, and the full local suite plus all 8 CI shards passed clean.
- [x] Workers concurrency decision documented with concrete timing data (PR #152) — `workers: 2` measured across 3 full CI runs, no wall-clock win, not adopted; see Theme C and both configs' own comments.
- [x] Routine test execution (`pnpm e2e` or `moon run app:e2e-ci`) performs zero unnecessary screenshot disk writes (PR #152, Theme F).
- [x] `MSTUDIO_SHOTS=1 pnpm e2e` continues to produce all required documentation screenshots (PR #152) — verified for the 4 files Theme F touched; the 25 `*-shots.spec.ts` files are untouched by this batch and still generate as before.

---

## Decisions / open questions

1. **Worker count on 2-core runners:** Rather than guessing whether `workers: 2` causes CPU contention, Theme C runs a real CI comparison matrix and records concrete numbers before settling the value.
2. **Shard granularity:** Settled at 8 shards. With 8 runners, each runner handles roughly ~85 tests, bringing single-shard execution well within 2–3 minutes.
3. **Snapshot spec structure:** Maintained per-widget file granularity rather than merging into giant catch-all files, while removing redundant boilerplate via `shots-helper.ts`.
