import { expect, test, type Page } from '@playwright/test';

import { ciFixtures, ciSha, openCiGraph } from './graph-ci-fixture';
import { setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * Screenshots for the Diff Chart column in Timeline Graph view (ad hoc).
 * Captures the graph with Diff Chart column enabled across light and dark themes.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/adhoc-diff-chart-column';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.use({ viewport: { width: 1360, height: 820 } });

const mockDiffStats = {
  [ciSha(0)]: { added: 120, deleted: 45, files: 4 },
  [ciSha(1)]: { added: 350, deleted: 20, files: 7 },
  [ciSha(2)]: { added: 15, deleted: 180, files: 3 },
  [ciSha(3)]: { added: 0, deleted: 240, files: 5 },
  [ciSha(4)]: { added: 280, deleted: 0, files: 6 },
  [ciSha(5)]: null, // merge commit
  [ciSha(6)]: { added: 50, deleted: 35, files: 3 },
  [ciSha(7)]: { added: 8, deleted: 3, files: 1 },
};

const fixtureWithDiffStats = {
  ...ciFixtures,
  commitStats: mockDiffStats,
};

async function land(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await setTheme(page, theme);
  await openCiGraph(page, fixtureWithDiffStats);
  await setReducedMotion(page);
  await setTheme(page, theme, { settleMs: 500 });

  // Toggle on the Diff Chart column from ColumnsMenu
  await page.getByRole('button', { name: 'Configure columns' }).click();
  const diffChartOption = page.getByRole('menuitemcheckbox', { name: /Diff Chart/i });
  await diffChartOption.click();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('columnheader', { name: 'Diff Chart' })).toBeVisible();
  await expect(page.locator('[data-testid="diff-chart-cell"]').first()).toBeVisible();
  await page.waitForTimeout(400);
}

for (const theme of ['light', 'dark'] as const) {
  test(`graph with diff chart column — ${theme}`, async ({ page }) => {
    await land(page, theme);
    await page.screenshot({ path: shotPath(OUT, `graph-diff-chart-${theme}.png`) });

    const grid = page.getByRole('grid');
    const box = (await grid.boundingBox())!;
    await page.screenshot({
      path: shotPath(OUT, `graph-diff-chart-crop-${theme}.png`),
      clip: { x: box.x, y: box.y - 28, width: 880, height: 8 * 30 + 28 },
    });
  });
}
