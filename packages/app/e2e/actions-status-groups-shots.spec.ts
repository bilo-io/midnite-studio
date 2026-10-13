import { expect, test } from '@playwright/test';

import { ciFixtures, openCiGraph } from './graph-ci-fixture';
import {
  clickRailLink,
  installMockBridge,
  setReducedMotion,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * Runs grouped by status — In progress, Skipped, Completed — on the Actions page
 * and in the commit CI modal. Needs a real browser only to be photographed.
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/actions-status-groups';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.use({ viewport: { width: 1360, height: 820 } });

test('Actions page — status accordions', async ({ page }) => {
  await installMockBridge(page, ciFixtures);
  await page.goto('/');
  await setTheme(page, 'dark');
  await clickRailLink(page, 'Actions');
  const list = page.getByRole('list', { name: 'Workflow runs' });
  await expect(list.getByRole('button', { name: /^In progress/ })).toBeVisible();
  await setReducedMotion(page);
  await page.mouse.move(1300, 780);
  await page.waitForTimeout(500);
  await page.screenshot({ path: shotPath(OUT, 'actions-page-dark.png') });
});

test('commit CI modal — status accordions', async ({ page }) => {
  await setTheme(page, 'dark');
  await openCiGraph(page);
  await setReducedMotion(page);
  await page.getByRole('button', { name: 'CI: running — open run' }).click();
  const modal = page.getByTestId('ci-run-modal');
  await expect(modal.getByRole('button', { name: /^Completed/ })).toBeVisible();
  await page.mouse.move(1300, 780);
  await page.waitForTimeout(600);
  await page.screenshot({ path: shotPath(OUT, 'ci-modal-dark.png') });
});
