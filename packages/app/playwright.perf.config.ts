import { defineConfig, devices } from '@playwright/test';

/**
 * The performance suite — Phase 36 Theme H.
 *
 * Separate from `playwright.config.ts` so the budgets can be asserted without
 * putting timing thresholds in the way of every functional run. `moon run
 * app:perf` runs this; `moon run :test` does not, by construction — the same
 * arrangement the `e2e` task already has, and for a stronger reason: a budget
 * failure is a *report*, and a report that blocks a green build on a busy laptop
 * gets disabled rather than read.
 *
 * `testDir: './e2e/perf'` and nothing else. The functional suite's specs stay
 * where they are; only the one timing assertion moved here out of
 * `diff-scroll-perf.spec.ts`, whose two structural row-count tests are exact,
 * cannot flake, and therefore belong in the default gate.
 *
 * `retries: 0` is deliberate and is carried over. A retried timing assertion
 * measures whichever attempt the machine happened to be quiet for, which is
 * worse than no assertion — it reports green while the regression is real. The
 * flake mitigation here is medians rather than maxima, and 2.5× headroom, not a
 * second try.
 *
 * The `webServer` block is a copy rather than an import: the two configs share a
 * port default and a `strictPort` argument, and a shared helper would make it
 * possible to change the functional suite's server by editing the perf suite's.
 * They are meant to be independently runnable, including at the same time.
 */
/*
  5275, not 5274: the functional config's own header names 5274 as the escape
  hatch a second worktree is told to use (`MSTUDIO_E2E_PORT=5274`), so defaulting
  here would turn the documented way out of a collision into a collision.
*/
const PORT = Number(process.env.MSTUDIO_PERF_PORT ?? 5275);

export default defineConfig({
  testDir: './e2e/perf',
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  /*
    Serially, always. Two workers measuring frame gaps on the same machine
    measure each other; the whole suite is four specs and takes seconds.
  */
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse a server this config did not start — same reasoning as the
    // functional config: a reused server may be serving a different checkout.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
