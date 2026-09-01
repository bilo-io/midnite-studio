import { expect, test, type Page } from '@playwright/test';

import { COMMIT_SHA, fixtures } from './fixtures';

/**
 * The virtualized scroll path, after Theme E made its rows measured.
 *
 * **Why this exists, and why Theme D deliberately did not write it.** Theme D
 * considered a scripted frame-timing assertion for syntax highlighting and
 * rejected it as CI-flaky, which was right: highlighting is scheduled through
 * `requestIdleCallback`, so its cost lands *between* frames and a timing
 * threshold would mostly measure the machine. Theme E is a different change with
 * a different risk. It replaced the virtualizer's fixed `estimateSize` with
 * `measureElement`, and the failure mode of getting that wrong is not "slower":
 * it is a measurement loop, or a virtualizer that gives up windowing and mounts
 * every row. Both are structural, both are visible in one page, and neither
 * shows up in any functional assertion — a diff that mounts all 4000 rows still
 * renders correctly.
 *
 * So the primary assertion here is **how many rows exist**, which is exact and
 * cannot flake. The timing assertion rides along behind a deliberately loose
 * ceiling: it is there to catch an order-of-magnitude regression, and it is
 * written not to fail on a busy runner.
 */

/** Big enough that a virtualizer failing to window is unmissable. */
const ROW_COUNT = 4000;

const bigDiff = {
  path: 'pnpm-lock.yaml',
  oldPath: 'pnpm-lock.yaml',
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: ROW_COUNT,
      heading: '',
      lines: Array.from({ length: ROW_COUNT }, (_, index) => ({
        kind: 'add',
        oldNo: null,
        newNo: index + 1,
        text: `  '@scope/package-${index}': 1.0.${index}`,
        ranges: [],
        noNewline: false,
      })),
    },
  ],
  insertions: ROW_COUNT,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
};

async function openBigDiff(page: Page): Promise<void> {
  const { installMockBridge } = await import('./mock-bridge');
  await installMockBridge(page, {
    ...fixtures,
    diffs: { ...fixtures.diffs, [`${COMMIT_SHA}:pnpm-lock.yaml`]: bigDiff },
  });
  await page.goto('/');

  await page.getByText('feat(phase-11): package, install and run from /Applications').click();
  await page.getByRole('button', { name: /pnpm-lock\.yaml/ }).click();
  await expect(page.getByTestId('diff-view')).toBeVisible();
}

const renderedRows = (page: Page) =>
  page.getByTestId('diff-view').locator('[data-line-kind]').count();

test('a 4000-line diff still mounts a windowed handful of rows', async ({ page }) => {
  await openBigDiff(page);

  // The exact assertion, and the one that would catch `measureElement` breaking
  // windowing outright. The window is viewport height / 18px plus 24 overscan
  // either side — a couple of hundred at any plausible pane size, never 4000.
  const mounted = await renderedRows(page);
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThan(400);
});

/*
  The median-frame-gap assertion that used to live here moved to
  `e2e/perf/diff-scroll.spec.ts` under `moon run app:perf` — Phase 36 Theme H.
  This file's header argued that a timing threshold "is there to catch an
  order-of-magnitude regression, and it is written not to fail on a busy runner",
  which is exactly the argument for keeping it out of the default gate: a
  threshold loose enough never to flake in `:test` is too loose to be a budget,
  and a threshold tight enough to be a budget will flake in `:test`. So it is now
  a budget, read from `scripts/perf/budgets.json`, in a suite that does not gate a
  commit. Phase 26's open question — budget or exact count — resolves as *both*,
  in the two places each belongs: the structural row counts below are exact and
  stay here.
*/

test('a 4000-line diff in split mode stays windowed and bounded', async ({ page }) => {
  await openBigDiff(page);

  // Toggle split mode
  const splitToggle = page.getByRole('button', { name: /split/i });
  if (await splitToggle.isVisible()) {
    await splitToggle.click();
  }

  const mounted = await renderedRows(page);
  expect(mounted).toBeGreaterThan(0);
  expect(mounted).toBeLessThan(400);
});

