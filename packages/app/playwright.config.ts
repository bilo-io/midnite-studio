import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-driven tests for the renderer.
 *
 * These run against the Vite dev server with a *mocked* `window.midniteStudio`
 * (see e2e/mock-bridge.ts) rather than against Electron. The renderer's only
 * route to the main process is that bridge, so replacing it is enough to drive
 * every UI path deterministically — and it keeps the suite runnable in CI
 * without a display server or a packaged app.
 *
 * What this does NOT cover, by design: the preload wiring and the main-process
 * handlers. Those are covered by desktop's own vitest suite and git-engine's
 * integration tests against real repositories.
 */
/**
 * Not 5173 — see the `reuseExistingServer` note below.
 *
 * Overridable because 5273 is contended the same way 5173 is, just less often:
 * two worktrees running the suite at once collide, and `strictPort` correctly
 * turns that into a hard error. `MSTUDIO_E2E_PORT=5274 pnpm e2e` is the way out,
 * rather than either session killing the other's server.
 */
const PORT = Number(process.env.MSTUDIO_E2E_PORT ?? 5273);

export default defineConfig({
  testDir: './e2e',
  /*
    `e2e/perf/` belongs to `playwright.perf.config.ts` and `moon run app:perf`
    (Phase 36 Theme H). Without this exclusion the functional suite would pick up
    the budget specs — including one that launches Electron three times — and the
    default gate would inherit exactly the timing thresholds that suite exists to
    keep out of it.
  */
  testIgnore: '**/perf/**',
  /*
    Playwright's default runs test *files* in parallel across workers but the
    `test()` declarations within one file sequentially. Phase 56 Theme B turns
    that off: with `fullyParallel: true`, every `test()` is scheduled
    independently, so a file with ten specs no longer forces one worker to run
    them one after another while a sibling worker sits idle waiting for the
    next file. `playwright.ci.config.ts` inherits this by spreading `base`.
  */
  fullyParallel: true,
  /*
    Phase 56 Theme C measured `workers: 2` against the standing `workers: 1`
    default (`ci.yml`'s own comment: a 2-core runner's cores/2 = ONE worker,
    raising it oversubscribes) on the theory that this suite — mostly waiting
    on the local Vite server and the DOM rather than CPU-bound — might not
    thrash the way that theory assumes. Three full CI runs at `workers: 2`
    (24 shard-attempts) came back 8/8, 8/8, 8/8 green — no flake increase —
    but averaged ~4m28s/shard against the `workers: 1` baseline's ~4m22s
    (PR #148: 3m24s–5m17s/shard). No measured win, so no `workers` override
    lands: the default stays. Left here rather than only in a commit message
    so a future re-measurement (a different runner tier, a much larger suite)
    knows this was tried and what it found.
  */
  /*
    Zero locally, two in CI — and the asymmetry is the whole point.

    The standing rule here was a flat `retries: 0`, on the grounds that this
    suite is UI-deterministic and a retry would therefore mask a real race
    rather than absorb infrastructure flake. That reasoning still holds for the
    run a human does: a race that reproduces on a developer's machine should
    stop them, because that is where it can actually be debugged.

    It was written, though, for a suite that had never run in CI — and when the
    job was finally added (2026-09-01) the suite turned out to fail about one
    run in two, one spec at a time, a different spec each time: a pointer
    interception here, a 500ms expect against a view that Phase 36 put behind a
    lazy boundary there. On a cold runner fetching chunks over a shared network,
    that is infrastructure variance, which is precisely the thing the original
    comment set retries against masking — and a blocking gate that is red half
    the time on nobody's fault is a gate that gets switched off.

    Phase 56 Theme D tried trimming this from 2 to 1, on the reasoning that
    with `KNOWN_RED` down to a single remaining file, a failing spec no longer
    needs three attempts' worth of runway to tell infrastructure variance from
    a real regression. CI disproved it: `titlebar-agents.spec.ts`'s "reduced
    motion keeps a running launcher glow and full opacity" — not in
    `KNOWN_RED`, previously reliable — failed twice in a row under
    `retries: 1` (a fresh full CI re-run each time) while passing clean in an
    exact local reproduction of the same shard. That is exactly the
    one-run-in-two infrastructure variance this value exists to absorb, and
    trimming it removed the margin this specific spec needs. Reverted to 2
    pending a real fix — either for this spec's own timing sensitivity or a
    second CI data set showing the trim is safe.

    So: strict where a failure is debuggable, tolerant where it is not. If a
    spec needs the retry every time, that is a real race and belongs in
    `.midnite/tasks/phases/phase-38-e2e-suite-repair.md`, not behind this flag.
  */
  retries: process.env.CI ? 2 : 0,
  /*
    Assertions and tests get longer in CI, for hardware reasons.

    A private repo's ubuntu runner is 2-core, so Playwright takes `cores/2` = ONE
    worker where a 12-core laptop takes six, on slower cores. Against that the 5s
    default `expect` window is not the same amount of time it is locally.

    An earlier version of this comment blamed Phase 36's lazy boundaries and
    claimed these values fixed five terminal specs. They did not: those specs
    fail because xterm wants a WebGL context the runner has none of, raising the
    timeout to 15s moved nothing, and they are ratcheted out in
    playwright.ci.config.ts with Phase 38 Theme I owning the real fix. The
    honest justification is only the hardware one above.

    Note the cost, because it bit once already: every failing spec burns up
    to 60s per attempt and is retried twice, so a failure is 3 minutes of wall
    clock. Nine such failures in one shard read as a hung job for 22 minutes.
    That is a reason to keep the suite green, not a reason to lower these — but
    it is why the e2e job carries a `timeout-minutes` cap.
  */
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    /**
     * Never reuse a server this config did not start.
     *
     * The dev port (5173) is contended: `moon run app:dev` from the primary
     * checkout and from any `.worktrees/*` copy all want it, and Playwright
     * happily reuses whichever got there first. The suite then passes or fails
     * against a DIFFERENT checkout's source — silently, since the app looks
     * entirely normal. A dedicated port plus `strictPort` turns that collision
     * into a startup error instead of a wrong answer.
     */
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
