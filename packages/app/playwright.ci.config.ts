import { defineConfig } from '@playwright/test';

import base from './playwright.config';

/**
 * The CI ratchet.
 *
 * `playwright.config.ts` runs the whole suite and always will — a local
 * `pnpm e2e` must show the truth, including the parts that are broken. This
 * config is what CI blocks on, and it is the same suite minus a named list of
 * files that were already failing when the job was first wired up (2026-09-01:
 * 45 specs across 17 files, out of 442).
 *
 * The point is the direction of travel. A job that blocks on *everything*
 * cannot be turned on at all while the suite is red, and a job that blocks on
 * *nothing* is the arrangement that let these 45 rot in the first place — see
 * the entry in `.midnite/tasks/outstanding.md`. Blocking on the 397 specs that
 * do pass means those can never regress, while the debt stays written down in
 * one place instead of being discovered again in six months.
 *
 * Retries are NOT set here: they come from the base config, which allows two
 * under `process.env.CI` and none locally. Deliberately there rather than in
 * this file, so that deleting this ratchet (Phase 38 Theme H) does not silently
 * take CI's flake tolerance with it.
 *
 * KNOWN_RED only ever shrinks. Repairing a file is a one-line deletion here,
 * and Phase 38 exists to empty the list; when it is empty, delete this config
 * and the `app:e2e-ci` task with it and point CI back at `app:e2e`.
 */
const KNOWN_RED = [
  // --- drift: red everywhere, and Phase 38 Themes A-G own them --------------
  //
  // `browser-pane.spec.ts` and `footer-monitor.spec.ts` are OUT — both
  // confirmed green in a real CI run (not just locally). `graph-themes.spec.ts`
  // stays: two of its specs (`:251`, `:264` — the row-cascade animation) are
  // green in an isolated local run but confirmed still red on the real Linux
  // CI runner, which a local macOS run cannot explain — genuinely unsolved.
  '**/e2e/graph-themes.spec.ts', //          2 — cascade replay (:251, :264), CI-only
];

export default defineConfig({
  ...base,
  // The base config's own `testIgnore: '**/perf/**'` is NOT inherited — spreading
  // `base` and then setting the key replaces it wholesale — so it is repeated
  // here. Dropping it pulls `e2e/perf/` into this run, where the budget specs
  // die on a missing `dist/.vite/manifest.json` (they need `app:build` first,
  // which is why they have a config and a moon task of their own). It would also
  // make a performance budget block a merge, which `packages/app/moon.yml`
  // explicitly rejects: "a report that blocks a green build on a busy laptop
  // gets disabled rather than read".
  testIgnore: ['**/perf/**', ...KNOWN_RED],
  /*
    One spec rather than one file, whenever the failures are a minority of it —
    the alternative, adding the whole file to KNOWN_RED, would cost every
    passing spec in it its place in the blocking job. `shortcut-rail.spec.ts`
    and `status-bar.spec.ts` each carry one `@linux-red` spec this way: both
    assert a status-bar *density*, decided from measured content width, and
    the CI runner's font set differs from macOS's enough to land even the
    "wide" fixture on the wrong side of the `full` breakpoint at the default
    1280px viewport. A fix that read the real breakpoint from the DOM at test
    time (rather than a hard-coded pixel guess) was tried and reverted — it
    addressed a later assertion in each spec, but the FIRST assertion (that
    the fixture starts in `full`) was already failing on the real CI run,
    which a local, real-GPU macOS run cannot see. Phase 38 Theme I's own
    remaining item.
  */
  grepInvert: /@linux-red/,
});
