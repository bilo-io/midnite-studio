import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, shotPath } from './shots-helper';

/**
 * Phase 86 Theme E — Notes leaves the modal. Two shots: the rail row itself
 * (Dashboard, the hairline, Notes, then the Workspace section) and the
 * placeholder Notes view it opens onto. Both are documentation shots for the
 * PR, not a visual-regression baseline — this theme is scaffolding, and the
 * real page (Theme G) is what earns a `toHaveScreenshot` baseline.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/phase-86-theme-e';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  // A generous timeout, not the suite default: the very first hit against a
  // cold Vite dev server pays for on-demand transforms of the whole module
  // graph, which the default 5s can lose to on a loaded machine.
  await expect(page.getByTestId('status-bar')).toBeVisible({ timeout: 20_000 });
}

test('rail row — Notes pinned under Dashboard, with the hairline between them', async ({ page }) => {
  await open(page);
  const rail = page.getByRole('navigation', { name: 'Views' });
  await rail.hover();
  await expect(rail.getByText('Notes', { exact: true })).toBeVisible();
  await rail.screenshot({ path: shotPath(OUT, 'rail-row.png') });
});

test('Notes view — placeholder shell for the selected repo', async ({ page }) => {
  await open(page);
  await clickRailLink(page, 'Notes');
  await expect(page.getByRole('region', { name: 'Notes' })).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'notes-view.png') });
});
