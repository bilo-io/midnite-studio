import { expect, test, type Page } from '@playwright/test';

import { openCiGraph } from './graph-ci-fixture';
import { setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * The graph's CI column (ad hoc): the graph with mixed statuses, and the run
 * modal open on a running and on a failed run — light and dark.
 *
 * Reduced motion so the running spinner and shimmer rest at the same frame in
 * every run. Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/adhoc-graph-ci';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.use({ viewport: { width: 1360, height: 820 } });

async function land(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await setTheme(page, theme);
  await openCiGraph(page);
  await setReducedMotion(page);
  await setTheme(page, theme, { settleMs: 500 });
}

for (const theme of ['light', 'dark'] as const) {
  test(`graph — ${theme}`, async ({ page }) => {
    await land(page, theme);
    await page.screenshot({ path: shotPath(OUT, `graph-ci-column-${theme}.png`) });
    // A close crop of the column, where the connector runs under the marks.
    const grid = page.getByRole('grid');
    const box = (await grid.boundingBox())!;
    await page.screenshot({
      path: shotPath(OUT, `graph-ci-column-crop-${theme}.png`),
      clip: { x: box.x, y: box.y - 28, width: 560, height: 8 * 30 + 28 },
    });
  });

  test(`modal on a failed run — ${theme}`, async ({ page }) => {
    await land(page, theme);
    await page.getByRole('button', { name: 'CI: failed — open run' }).click();
    const modal = page.getByTestId('ci-run-modal');
    await expect(modal.getByRole('button', { name: 'test (macos-14)', exact: true }).first()).toBeVisible();
    await page.waitForTimeout(600);
    await page.screenshot({ path: shotPath(OUT, `ci-modal-failed-${theme}.png`) });
  });

  test(`modal on a running run — ${theme}`, async ({ page }) => {
    await land(page, theme);
    await page.getByRole('button', { name: 'CI: running — open run' }).click();
    const modal = page.getByTestId('ci-run-modal');
    await expect(modal.getByRole('button', { name: 'test (macos-14)', exact: true }).first()).toBeVisible();
    // Open the running job's steps so the shimmer on the running step shows.
    await modal.getByRole('button', { name: 'Steps in test (macos-14)' }).click();
    // Park the pointer off the pane so the chevron's tooltip is not in the shot.
    await page.mouse.move(1300, 780);
    await page.waitForTimeout(600);
    await page.screenshot({ path: shotPath(OUT, `ci-modal-running-${theme}.png`) });
  });
}
