import { defineConfig } from 'vitest/config';

/**
 * The workspace-root project's suite: the repo-wide `scripts/*.mjs` tools.
 *
 * These had tests but no runner — `moon run :test` walks every project, and
 * `moon.yml` excluded the inherited `test` task from `root`, so
 * `version-check.test.mjs`, `tracker-check.test.mjs` and
 * `publish-feed-changelog.test.mjs` passed locally and were never once executed
 * in CI. Two of the three guard release machinery, which is why Phase 53
 * Theme F's rehearsal is what found it.
 *
 * `.mjs` rather than `.ts` because the scripts themselves are plain ESM — they
 * run under bare `node` in `moon ci` and in `release.yml` before anything is
 * built, so they must not need a transform.
 */
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.mjs'],
    environment: 'node',
  },
});
