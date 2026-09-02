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
  // Theme D fixed its own two named specs — 'a reload keeps live sessions
  // live' and 'the session list resizes independently of the terminal pane'
  // — confirmed stable over three local runs each. The file stayed ratcheted
  // regardless, because un-ratcheting it for the first time surfaced real
  // failures in OTHER specs — 'an agent row carries its own mark and its own
  // accent', 'two agents from the same roster get different marks' and at
  // least one more — that were new sightings of exactly the GPU-less-runner
  // wall documented above, on marks that assert xterm content rather than
  // session state. Theme I's DOM-renderer-under-test fallback (this file's
  // own `webServer.env`, read by `terminal-view.tsx`) closes that wall for
  // every terminal spec at once, this file included — verified locally with
  // the fallback forced on, all green — so it drops from KNOWN_RED entirely
  // rather than picking up `@linux-red` tags for specs Theme D never named.
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
    the CI runner's font set differs from macOS's enough to land the same
    viewport on the other side of the breakpoint. A different Linux-only cause
    from the WebGL wall Phase 38 Theme I closed (which is what emptied this
    tag everywhere else it appeared) — Theme I's own remaining item.
  */
  grepInvert: /@linux-red/,
});
