import { expect, test, type Page } from '@playwright/test';

import { fixtures, PARENT_SHA } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The diff renderer, driven through the real app against a mocked bridge.
 *
 * These assert what the unit tests cannot: that a commit's file list actually
 * reaches `<DiffView>`, that the add/del treatment lands on the right rows, and
 * that expansion refetches rather than revealing text the renderer already had.
 */

/** Open the app, wait for the graph, and select the fixture commit. */
async function openCommit(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');

  const row = page.getByText('feat(phase-11): package, install and run from /Applications');
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.getByRole('button', { name: /window\.ts/ })).toBeVisible();
}

const diff = (page: Page) => page.getByTestId('diff-view');
const lines = (page: Page, kind: 'add' | 'del' | 'ctx') =>
  diff(page).locator(`[data-line-kind="${kind}"]`);

test('a commit shows no diff until a file is chosen', async ({ page }) => {
  await openCommit(page);

  await expect(page.getByText('Select a file to see what changed in it.')).toBeVisible();
  await expect(diff(page)).toHaveCount(0);
});

test('choosing a file renders its hunks with add and delete rows', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: /window\.ts/ }).click();

  await expect(diff(page)).toBeVisible();
  await expect(lines(page, 'add')).toHaveCount(4);
  await expect(lines(page, 'del')).toHaveCount(1);
  await expect(lines(page, 'ctx')).toHaveCount(3);

  // The hunk heading is structure, and renders alongside the lines.
  await expect(diff(page).getByText('function createWindow() {')).toBeVisible();
});

test('the changed word inside a modified line is marked, and the rest is not', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: /window\.ts/ }).click();

  const added = lines(page, 'add').first();
  await expect(added).toContainText('height: 880,');

  // Exactly one intraline span, and it covers the number rather than the line.
  const marked = added.locator('span[data-diff-mark]');
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveText('880');
});

test('the old line-number column is off by default and toggles on', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: /window\.ts/ }).click();

  const firstRow = lines(page, 'ctx').first();
  // One gutter: the new-file number only.
  await expect(firstRow.locator('span.tabular-nums')).toHaveCount(1);

  await page.getByRole('button', { name: 'Show original line numbers' }).click();
  await expect(firstRow.locator('span.tabular-nums')).toHaveCount(2);

  // And the preference is persisted, so it survives a reload.
  await page.reload();
  await page.getByText('feat(phase-11): package, install and run from /Applications').click();
  await page.getByRole('button', { name: /window\.ts/ }).click();
  await expect(page.getByRole('button', { name: 'Hide original line numbers' })).toBeVisible();
});

test('toggling side-by-side diff switches rendering layout', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: /window\.ts/ }).click();

  const toggle = page.getByRole('button', { name: 'Switch to side-by-side diff' });
  await expect(toggle).toBeVisible();
  await toggle.click();

  await expect(page.getByRole('button', { name: 'Switch to unified diff' })).toBeVisible();

  // The fixture's one deletion and four additions are an UNEVEN run, so the
  // aligner (Levenshtein distance, `split-diff-rows.ts`) pairs the deletion
  // with its closest addition on one row and gives the other three additions
  // their own rows, each with an empty left cell — never one row holding all
  // four. Every add still carries its own right-hand cell (4), which is why
  // this count is unchanged from the unified view's; what split view adds is
  // the three placeholder left cells the unmatched additions render against.
  await expect(lines(page, 'add')).toHaveCount(4);
  await expect(diff(page).getByTestId('diff-cell-left-empty')).toHaveCount(3);
});


test('a gap between hunks offers an expander, and expanding refetches at wider context', async ({
  page,
}) => {
  await openCommit(page);
  await page.getByRole('button', { name: /ci\.yml/ }).click();

  // Hunk 1 covers new lines 1..4; hunk 2 starts at 61.
  const expander = page.getByRole('button', { name: 'Expand 57 hidden lines' });
  await expect(expander).toBeVisible();

  await expander.click();

  // The wider fixture is a single merged hunk, so the gap marker is gone and
  // context the narrow diff never carried is now on screen.
  await expect(page.getByRole('button', { name: /Expand \d+ hidden lines/ })).toHaveCount(0);
  await expect(diff(page).getByText('runs-on: ubuntu-latest')).toBeVisible();
});

test('a binary file says so instead of rendering an empty pane', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: /inter\.woff2/ }).click();

  // Asserting the TEXT, not just that something rendered: the inspector used to
  // fall back to "No changes to show for this file" for a binary blob while the
  // working-tree pane said the right thing.
  await expect(page.getByTestId('diff-empty')).toHaveText('Binary file — no textual diff.');
});

test('a binary IMAGE gets the viewer rather than the sentence', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: /phase-11-packaged-app\.png/ }).click();

  // The bytes come from `mstudio-file://`, which does not exist in a browser — so
  // this asserts the viewer's chrome, which is what the renderer owns: both
  // revisions named, and the compare modes offered.
  const viewer = page.getByTestId('image-diff');
  await expect(viewer).toBeVisible();
  await expect(page.getByTestId('diff-empty')).toHaveCount(0);
  await expect(viewer.getByTestId('image-before')).toBeVisible();
  await expect(viewer.getByTestId('image-after')).toBeVisible();

  await viewer.getByRole('button', { name: 'Swipe' }).click();
  await expect(viewer.getByRole('slider', { name: 'Swipe position' })).toBeVisible();

  await viewer.getByRole('button', { name: 'Onion' }).click();
  await expect(viewer.getByRole('slider', { name: 'New revision opacity' })).toBeVisible();
});

test('a capped diff reports how many lines it withheld', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: /pnpm-lock\.yaml/ }).click();

  await expect(diff(page).getByText(/16,412 more lines not shown/)).toBeVisible();
});

test('clicking the open file again closes its diff', async ({ page }) => {
  await openCommit(page);
  await page.getByRole('button', { name: /window\.ts/ }).click();
  await expect(diff(page)).toBeVisible();

  await page.getByRole('button', { name: /window\.ts/ }).click();
  await expect(page.getByText('Select a file to see what changed in it.')).toBeVisible();
});

test('syntax highlighting colours a line without disturbing the intraline diff mark', async ({
  page,
}) => {
  await openCommit(page);
  await page.getByRole('button', { name: /window\.ts/ }).click();
  await expect(diff(page)).toBeVisible();

  // Highlighting is scheduled through requestIdleCallback and lands
  // asynchronously — Playwright's own auto-retrying `expect` is the wait.
  const coloured = diff(page).locator('span[style*="color"]');
  await expect(coloured.first()).toBeVisible();

  // The existing intraline mark still renders, and still covers the same
  // text — colour is an inner layer over it, not a replacement for it.
  const added = lines(page, 'add').first();
  const marked = added.locator('span[data-diff-mark]');
  await expect(marked).toHaveCount(1);
  await expect(marked).toHaveText('880');

  // The diff itself is unchanged: same row counts as the un-highlighted
  // assertion above, and the virtualized pane keeps scrolling without
  // erroring now that every row also schedules a highlight.
  await expect(lines(page, 'add')).toHaveCount(4);
  await diff(page).hover();
  await page.mouse.wheel(0, 200);
  await expect(diff(page)).toBeVisible();
});

test('switching commits clears the selected file rather than carrying it over', async ({ page }) => {
  // The path may not even exist in the next commit, which would leave a
  // permanently empty diff pane with no clue as to why. Reachable as a real
  // gesture now that Theme B has parent navigation — the previous version of
  // this test could only approximate it by deselecting.
  await openCommit(page);
  await page.getByRole('button', { name: /window\.ts/ }).click();
  await expect(diff(page)).toBeVisible();

  await page.getByRole('button', { name: `Show commit ${PARENT_SHA}` }).click();

  await expect(page.getByText('Select a file to see what changed in it.')).toBeVisible();
  await expect(diff(page)).toHaveCount(0);
});
