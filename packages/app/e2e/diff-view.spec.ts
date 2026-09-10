import { expect, test, type Page } from '@playwright/test';

import { COMMIT_SHA, fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * The diff renderer, driven through the real app against a mocked bridge.
 *
 * **9 of this spec's original 12 tests moved to `diff-view.bridge.test.tsx`
 * under jsdom** (Phase 82 Theme C, wave 2): the add/delete hunk rendering,
 * the intraline mark, the gap expander, the binary and image states and the
 * capped-diff message — proven, not merely hoped for, against the
 * `FiringResizeObserver` fix PR #328 landed ahead of this wave. See that
 * file's own header comment for the removed-test → replacement-test mapping.
 *
 * **3 remain here.** "Toggling side-by-side diff switches rendering layout"
 * needs `useTooNarrowForSplit`'s real `el.clientWidth` (permanently `0` under
 * jsdom, per that hook's own doc comment — a dedicated `e2e/diff-split.spec.ts`
 * already exists for the width-fallback measurement itself). "The old
 * line-number column is off by default and toggles on" keeps its own toggle
 * behaviour duplicated in the jsdom test — the reload half is what makes this
 * one stay, the same `zustand/persist` rehydration reasoning
 * `commit-detail.bridge.test.tsx`'s header comment gives for its own reload
 * stragglers. And "syntax highlighting colours a line" is Theme D's pixel-diff
 * territory.
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

/**
 * Open the commit as a full-width workbench tab (Theme G) rather than the
 * graph's narrow inspector dock.
 *
 * Needed for anything that exercises SPLIT: `LAYOUT_BOUNDS.detailWidth` caps
 * that dock at 720px and it renders one pixel short of even that by default
 * (`DIFF_SPLIT_MIN_WIDTH`, Theme C's width fallback), so the toggle is
 * permanently disabled there — by design, which is the whole reason the
 * full-width tab exists.
 */
async function openCommitInTab(page: Page): Promise<void> {
  await openCommit(page);
  await page.getByRole('button', { name: `Open commit in tab (${COMMIT_SHA})` }).click();

  // The nav rail's hover-expand reflow moves a collapsed link out from under a
  // synthetic click before it lands — hover first and wait for the expanded
  // label, per `changes-panel.spec.ts`'s own note on this exact hazard.
  const link = page.getByRole('link', { name: 'Changes' });
  await link.hover();
  await expect(link.getByText('Changes', { exact: true })).toBeVisible();
  await link.click();

  await expect(page.getByRole('button', { name: /window\.ts/ })).toBeVisible();
}

const diff = (page: Page) => page.getByTestId('diff-view');
const lines = (page: Page, kind: 'add' | 'del' | 'ctx') =>
  diff(page).locator(`[data-line-kind="${kind}"]`);

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
  await openCommitInTab(page);
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
