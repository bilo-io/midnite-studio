import { defineConfig, devices } from '@playwright/test';

/**
 * The pixel-diff layer — Phase 82 Theme D.
 *
 * Separate from `playwright.config.ts` for the same reason `playwright.perf.config.ts`
 * is: a visual assertion is a different KIND of check from a functional one, and mixing
 * the two into one gate means a font-rendering hiccup blocks the same run a broken click
 * handler would. `moon run app:visual` runs this; `moon run :test` and the default `e2e`
 * task do not, by construction.
 *
 * `testDir: './e2e/visual'` and nothing else — the functional suite's specs (including
 * every `*-shots.spec.ts` file `playwright.config.ts` gates behind `MSTUDIO_SHOTS`) stay
 * where they are. This layer is deliberately new files, not a repurposing of the shots
 * family: those specs write ad-hoc PNGs a human looks at (many outside git entirely, or
 * under `docs/screenshots/`); this layer writes committed baselines a machine diffs.
 *
 * ## Why Linux-only baselines
 *
 * Phase 38 Theme I already found cross-platform font rasterisation bites this repo:
 * rail-density specs tuned against macOS fonts were red only on Linux CI. A pixel-diff
 * layer amplifies that same hazard by orders of magnitude — a functional assertion
 * ("is this element visible") tolerates a few different subpixels, `toHaveScreenshot`
 * does not. So `snapshotPathTemplate` below carries `{platform}`: on a Mac dev machine
 * `process.platform` is `darwin`, on CI/the regeneration docker image it is `linux`, and
 * the two never collide or get compared against each other. Only `-linux.png` baselines
 * are ever committed; see `.gitignore`'s entry for this directory, which keeps a local
 * `-darwin.png` run (harmless for proving two-consecutive-runs-are-identical locally)
 * from ever landing in a commit.
 *
 * Regenerate committed baselines through the OFFICIAL Playwright image, which pins the
 * exact font/fontconfig/freetype versions this repo's CI Linux runner also gets (both
 * are Ubuntu 24.04 "noble" — see the `visual` job in `.github/workflows/ci.yml`, which
 * runs the SAME image as its container rather than trusting the bare runner's own font
 * packages to match byte-for-byte):
 *
 *   docker run --rm -v "$PWD:/w" -w /w mcr.microsoft.com/playwright:v1.62.1-noble bash -c "
 *     corepack enable && corepack prepare pnpm@9.15.0 --activate &&
 *     pnpm install --frozen-lockfile --ignore-scripts &&
 *     cd packages/app && pnpm exec playwright test --config playwright.visual.config.ts -u"
 *
 * Three things about that command are NOT the obvious one-liner a docker recipe would otherwise
 * be, and all three are load-bearing — verified against a real checkout (twice: a fresh one and
 * a re-run) before this comment was written:
 *
 *  1. Bare `npx playwright` fails outright (`playwright: not found`) from the workspace root —
 *     `@playwright/test` is a devDependency of THIS package, and pnpm's non-flat, per-package
 *     `node_modules` layout never hoists its `playwright` bin up to where `npx` looks. `cd
 *     packages/app` first, then `pnpm exec`, which resolves it from the right `node_modules/.bin`.
 *  2. `--ignore-scripts` on the install is required, not optional, inside this specific image:
 *     it ships no `make`/build-essential, so `better-sqlite3`'s and `node-pty`'s native builds
 *     (desktop's and git-engine's dependencies, never this package's) fail the install outright
 *     without it.
 *  3. Deliberately NOT `pnpm exec moon run app:visual` (which would also build `shared` first,
 *     one command instead of two) — `vite.config.ts` already aliases `@midnite/studio-shared`
 *     straight to `../shared/src/index.ts`, so nothing here needs `shared` built at all, and
 *     going through moon pulls in `@moonrepo/cli`'s own platform-specific optional native binary
 *     (`@moonrepo/core-<platform>-<arch>-*`). Fine on a genuinely fresh checkout, but a dev's
 *     REAL checkout usually already has a host (macOS/Windows) `node_modules` on disk before
 *     this command ever runs, and pnpm does not reliably re-resolve an ALREADY-INSTALLED
 *     optional native package for a second platform under `--frozen-lockfile` against that same
 *     directory — moon's own binary hit exactly this (`Cannot find module
 *     '@moonrepo/core-linux-arm64-gnu/package.json'`) when this command was tried against a real,
 *     previously-`pnpm install`-ed worktree rather than a fresh one. `@playwright/test` itself
 *     has no such native binary, so bypassing moon sidesteps the whole class of failure.
 *
 * ## Why component-scoped crops, never full pages
 *
 * `docs/screenshots/` is already 648 images / 66 MB in the working tree, and screenshot
 * blobs are roughly two-thirds of the repo's ~178 MB `.git`. A full-page PNG is ~100 KB;
 * a `locator.screenshot()` crop of just the component under test is ~10-20 KB. Every spec
 * in `e2e/visual/` calls `.screenshot()`/`toHaveScreenshot()` on a `Locator`, never on
 * `page` — `scripts/visual-budget.mjs` enforces the corpus stays under ~100 baselines /
 * 3 MB so this layer cannot silently regrow into the same problem.
 */
const PORT = Number(process.env.MSTUDIO_VISUAL_PORT ?? 5276);

export default defineConfig({
  testDir: './e2e/visual',
  /*
   * `snapshotPathTemplate`'s `{platform}` token is what makes "Linux-only baselines"
   * true rather than aspirational — see the file header. `{arg}` is the name each
   * `toHaveScreenshot('name.png')` call passes (or an auto-numbered index for the
   * bare `toHaveScreenshot()` form); every spec here uses the named form so a diff
   * in the PR is legible by filename alone.
   */
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}',
  /*
   * A component crop diffing at the sub-pixel level needs more margin than a
   * functional assertion — 0.2% of the crop's pixels, which absorbs anti-aliasing
   * jitter along a rounded border or a glow's soft edge without absorbing a real
   * colour or layout regression. Applied globally rather than per-call so every
   * new spec in this directory inherits it without having to know the number.
   */
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.002 },
  },
  fullyParallel: true,
  /*
   * Zero locally — a visual race should stop a developer, the same reasoning
   * `playwright.config.ts` gives for its own zero. In CI: one retry, not two.
   * `toHaveScreenshot` already carries its own internal poll-and-compare retries
   * (Playwright re-screenshots up to `expect.timeout` looking for a stable frame
   * before ever comparing pixels), so the flake class the functional suite's
   * `retries: 2` exists for — a genuinely slow app settling under a busy 2-core
   * CI runner — is already absorbed before this layer's retry would ever fire.
   */
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse a server this config did not start — the same collision
    // hazard the functional and perf configs both guard against.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
