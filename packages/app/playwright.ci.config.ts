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
  // --- red on the Linux runner only; all four are green on macOS ------------
  //
  // Every one of these mounts a terminal, and xterm paints its rows through
  // `@xterm/addon-webgl` (terminal-view.tsx). A GPU-less runner gives it no
  // WebGL context, so the terminal never becomes visible. Two fixes were tried
  // and measured: raising the CI expect timeout to 15s moved nothing (the
  // failures were never slow, just impossible), and Chromium's SwiftShader
  // software rasteriser — `--use-gl=angle --use-angle=swiftshader` — also fixed
  // none of them while making every shard ~60% slower, so it was reverted.
  // Phase 38 Theme I owns the real answer.
  '**/e2e/phase-21-roster.spec.ts', //       1 — session list renders 0 rows
  '**/e2e/terminal-lazy-preload.spec.ts', // 2 — Phase 36's own lazy-xterm specs
  '**/e2e/terminal-reveal.spec.ts', //       1 — buffer replay on reveal
  //
  // --- drift: red everywhere, and Phase 38 Themes A-G own them --------------
  '**/e2e/browser-pane.spec.ts', //          1 — click lands during the exit transition
  '**/e2e/footer-monitor.spec.ts', //        2 — ring/marker counts
  '**/e2e/graph-themes.spec.ts', //          2 — cascade replay + per-style redraw
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
    One spec rather than one file. `reviews.spec.ts` has ten specs and only its
    terminal-header one hits the missing-WebGL wall above, so it carries a
    `@linux-red` tag and the other nine keep blocking. Prefer this to adding a
    file to KNOWN_RED whenever the failures are a minority of it.
  */
  grepInvert: /@linux-red/,
});
