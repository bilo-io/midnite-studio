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

    So: strict where a failure is debuggable, tolerant where it is not. If a
    spec needs the retry every time, that is a real race and belongs in
    `.midnite/tasks/phases/phase-38-e2e-suite-repair.md`, not behind this flag.
  */
  retries: process.env.CI ? 2 : 0,
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
