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
 * under `process.env.CI` (Phase 56 Theme D tried trimming this to one; a real
 * CI run disproved it — see the base config's own comment) and none locally.
 * Deliberately there rather than in this file, so that deleting this ratchet
 * (Phase 38 Theme H) does not silently take CI's flake tolerance with it.
 *
 * KNOWN_RED only ever shrinks. Repairing a file is a one-line deletion here,
 * and Phase 38 exists to empty the list; when it is empty, delete this config
 * and the `app:e2e-ci` task with it and point CI back at `app:e2e`.
 */
const KNOWN_RED: string[] = [
  // --- drift: red everywhere, and Phase 38 Themes A-G own them --------------
  //
  // Empty. `browser-pane.spec.ts`, `footer-monitor.spec.ts` and
  // `graph-themes.spec.ts` are all OUT — see Phase 38 Theme G for the last
  // one's root cause. Diagnostic run (Phase 38 Theme G, PR TBD): unratcheting
  // the whole file to let a real CI run say which of its specs are actually
  // red on Linux, rather than trusting the stale `:251`/`:264` line numbers
  // this comment used to cite.
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
    and `status-bar.spec.ts` used to each carry one `@linux-red` spec this way
    — both asserted a status-bar *density* at hard-coded viewport widths, and
    density is decided from measured content width, which the CI runner's
    font set renders differently from macOS. A live-measurement fix (stamping
    `data-density` and reading `scrollWidth`, the trick `use-overflow.ts` and
    `titlebar-agents.spec.ts` both use) does NOT generalise to this element —
    the status bar's `grid-cols-[1fr_auto_1fr]` tracks stretch to fill a wide
    viewport, so `scrollWidth` reads back `clientWidth` rather than real
    content demand. Fixed instead (Phase 38 Theme I) by walking the viewport
    down and asserting each density band the instant the bar first reports
    it. `panel-snap.spec.ts`'s one remaining `@linux-red` spec was unrelated:
    it mounts a real terminal, the wall Theme I's `mock-bridge.ts` platform
    pin already closed for every other file that hit it.
  */
  grepInvert: /@linux-red/,
});
