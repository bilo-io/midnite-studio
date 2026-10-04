import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setReducedMotion, setTheme, shotPath } from './shots-helper';

/**
 * The Workflows node palette, grouped (ad hoc, after Phase 97): every group
 * open, a search spanning groups, one group folded, and a new kind's
 * inspector form — for the PR body. Run with `MSTUDIO_SHOTS=1`; skipped
 * otherwise, like every other `*-shots.spec.ts`, and excluded from the e2e
 * budget by name.
 */
const OUT = '../../docs/screenshots/adhoc-workflow-palette';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });
// Tall enough for all eight groups to be open at once without the palette scrolling.
test.use({ viewport: { width: 1600, height: 2000 } });

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(async () => {
    await clickRailLink(page, 'Graphs');
    await expect(page.getByRole('button', { name: 'New workflow' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await page.getByRole('button', { name: 'New workflow' }).click();
  await expect(page.getByRole('region', { name: 'Node types' })).toBeVisible();
}

/** The palette column — header, filter and the grouped list. */
const palette = (page: Page) => page.getByRole('region', { name: 'Node types' }).locator('..');

for (const mode of ['dark', 'light'] as const) {
  test(`grouped node palette (${mode})`, async ({ page }) => {
    await setTheme(page, mode);
    await setReducedMotion(page);
    await open(page);

    await palette(page).screenshot({ path: shotPath(OUT, `palette-grouped-${mode}.png`) });

    await page.getByPlaceholder('Filter nodes…').fill('file');
    await expect(page.getByRole('listitem', { name: 'Add Write file node' })).toBeVisible();
    // Only the top of the column: below two hits there is nothing but empty panel.
    const box = (await palette(page).boundingBox())!;
    await page.screenshot({
      path: shotPath(OUT, `palette-search-${mode}.png`),
      clip: { x: box.x, y: box.y, width: box.width, height: 260 },
    });
    await page.getByPlaceholder('Filter nodes…').fill('');

    for (const group of ['Control flow', 'Data & transform', 'Harness & notes']) {
      await page.getByRole('region', { name: 'Node types' }).getByRole('button', { name: new RegExp(`^${group}`) }).click();
    }
    await palette(page).screenshot({ path: shotPath(OUT, `palette-folded-${mode}.png`) });
  });
}

test('a new kind in the editor (dark)', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await setTheme(page, 'dark');
  await setReducedMotion(page);
  await open(page);

  await page.getByRole('listitem', { name: 'Add AI extract node' }).click();
  // Adding places the node; selecting it is what opens its form.
  await page.locator('[data-node-id]').first().click();
  await page.getByLabel('Source').fill('{{fetch.body}}');
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByRole('button', { name: 'Add field' }).click();
  await page.getByLabel('Field 1 key').fill('title');
  await page.getByLabel('Field 2 key').fill('severity');
  await page.getByLabel('Field 2 description').fill('low, medium or high');
  // The whole window: the grouped palette, the node on the canvas and its form, side by side.
  await page.screenshot({ path: shotPath(OUT, 'inspector-ai-extract-dark.png') });
});
