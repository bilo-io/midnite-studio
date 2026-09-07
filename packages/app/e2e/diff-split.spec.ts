import { expect, test, type Page } from '@playwright/test';

import { COMMIT_SHA, fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The three assertions Theme C's own build skipped (Phase 26 refinement x1):
 * gutter numbers on an unbalanced hunk, a blank opposite on a one-sided row,
 * and the layout preference surviving a reload. The single existing split
 * test, `e2e/diff-view.spec.ts`'s `toggling side-by-side diff switches
 * rendering layout`, asserts none of these — it only checks that the toggle
 * flips and that the row/empty-cell COUNTS match.
 */

const UNBALANCED_PATH = 'packages/desktop/src/main/unbalanced-diff.ts';

/**
 * A 5-add/2-del run, aligned by `alignRuns`'s Levenshtein pairing
 * (`split-diff-rows.ts`). Every line's text is a run of a single, distinct
 * character shared with none of the others, so every del/add pair has the
 * same normalized edit distance (1.0) — the alignment is then decided purely
 * by the algorithm's own tie-break (prefer a match over two skips), which
 * pairs the LAST two of the five adds with the two dels and leaves the first
 * three unmatched. That is a property of the algorithm, not a guess: change
 * the text and the pairing below may no longer hold.
 *
 * `oldNo` climbs 50/51 on the two dels; `newNo` climbs 100..104 across the
 * five adds — disjoint ranges, so a left-gutter number and a right-gutter
 * number can never be mistaken for each other in the assertions below.
 */
const unbalancedDiff = {
  path: UNBALANCED_PATH,
  oldPath: UNBALANCED_PATH,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  insertions: 5,
  deletions: 2,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
  hunks: [
    {
      oldStart: 50,
      oldLines: 2,
      newStart: 100,
      newLines: 5,
      heading: 'function unbalanced() {',
      lines: [
        { kind: 'del', oldNo: 50, newNo: null, text: 'kkkkkkkkkk', ranges: [], noNewline: false },
        { kind: 'del', oldNo: 51, newNo: null, text: 'qqqqqqqqqq', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 100, text: 'aaaaaaaaaa', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 101, text: 'bbbbbbbbbb', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 102, text: 'cccccccccc', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 103, text: 'dddddddddd', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 104, text: 'eeeeeeeeee', ranges: [], noNewline: false },
      ],
    },
  ],
};

/**
 * The shared commit, plus one extra file — merged rather than duplicated, so
 * this spec exercises the same commit/graph wiring every other diff spec
 * does instead of standing up its own.
 */
function withUnbalancedFile(): MockFixtures {
  const commit = fixtures.commitDetails[COMMIT_SHA] as {
    files: Array<{ path: string; oldPath: string | null; insertions: number; deletions: number }>;
  };

  return {
    ...fixtures,
    commitDetails: {
      ...fixtures.commitDetails,
      [COMMIT_SHA]: {
        ...commit,
        files: [
          ...commit.files,
          { path: UNBALANCED_PATH, oldPath: null, insertions: 5, deletions: 2 },
        ],
      },
    },
    diffs: {
      ...fixtures.diffs,
      [`${COMMIT_SHA}:${UNBALANCED_PATH}`]: unbalancedDiff,
    },
  };
}

async function openUnbalancedDiff(page: Page): Promise<void> {
  await installMockBridge(page, withUnbalancedFile());
  await page.goto('/');

  await page.getByText('feat(phase-11): package, install and run from /Applications').click();
  await page.getByRole('button', { name: /unbalanced-diff\.ts/ }).click();
  await expect(page.getByTestId('diff-view')).toBeVisible();
}

const diff = (page: Page) => page.getByTestId('diff-view');
const lines = (page: Page, kind: 'add' | 'del' | 'ctx') =>
  diff(page).locator(`[data-line-kind="${kind}"]`);

test('an unbalanced hunk reads its own oldNo/newNo sequence on each side', async ({ page }) => {
  await openUnbalancedDiff(page);

  /*
    `DiffCell`'s left-gutter wart (Phase 26 Verification, still open): the
    LEFT cell's `showGutter` reads `diffShowOldGutter` even in split, where
    every column should always show its own numbers regardless of that
    preference — so the toggle is switched on here, BEFORE entering split,
    to make the old-side numbers render at all. It has to happen first: the
    button that flips it is hidden once split is already on (Theme C's
    already-shipped behaviour — each column has its own gutter by
    construction, so the control has nothing left to do).
  */
  await page.getByRole('button', { name: 'Show original line numbers' }).click();
  await page.getByRole('button', { name: 'Switch to side-by-side diff' }).click();

  const leftNumbers = diff(page).locator('[data-side="left"][data-line-kind] span.tabular-nums');
  const rightNumbers = diff(page).locator('[data-side="right"][data-line-kind] span.tabular-nums');

  // Only the two paired rows have a real LEFT cell — the old side's own
  // sequence, in order, nothing from the unmatched adds.
  await expect(leftNumbers).toHaveText(['50', '51']);
  // Every add renders a real RIGHT cell, paired or not — the new side's own
  // sequence across all five rows.
  await expect(rightNumbers).toHaveText(['100', '101', '102', '103', '104']);
});

test('a one-sided row renders an empty cell opposite the real one', async ({ page }) => {
  await openUnbalancedDiff(page);
  await page.getByRole('button', { name: 'Switch to side-by-side diff' }).click();

  // Five adds and two dels, exactly as the fixture states — split renders
  // every line once, never doubling a row into two.
  await expect(lines(page, 'add')).toHaveCount(5);
  await expect(lines(page, 'del')).toHaveCount(2);

  // Three adds have no del to pair with (5-for-2): each gets an empty LEFT
  // cell opposite its own real add cell. No del goes unpaired the other way,
  // so there is no empty RIGHT cell at all.
  await expect(diff(page).getByTestId('diff-cell-left-empty')).toHaveCount(3);
  await expect(diff(page).getByTestId('diff-cell-right-empty')).toHaveCount(0);
});

test('the split preference survives a reload', async ({ page }) => {
  await openUnbalancedDiff(page);

  const toggle = page.getByRole('button', { name: 'Switch to side-by-side diff' });
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Switch to unified diff' })).toBeVisible();

  // `diffLayout` persists in `ui-store`'s `partialize` beside every other
  // diff preference — a fresh load must not silently fall back to unified.
  await page.reload();
  await page.getByText('feat(phase-11): package, install and run from /Applications').click();
  await page.getByRole('button', { name: /unbalanced-diff\.ts/ }).click();

  await expect(page.getByRole('button', { name: 'Switch to unified diff' })).toBeVisible();
});
