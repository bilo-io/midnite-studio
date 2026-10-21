import { test, expect } from '@playwright/test';

import { fixtures, installMockBridge, type MockFixtures } from './shots-helper';

/**
 * The ad hoc minute cadences (1m, 2m, 5m, 10m) in a loop's Schedule ▸ Every dropdown.
 *
 * Not assertions — `loop-composer.test.tsx` carries those, off the same `LOOP_FREQUENCIES` list.
 * Needs a real browser only for the PNG the PR embeds.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-loop-cadence-minutes';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

test('the cadence dropdown, open', async ({ page }) => {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await page.keyboard.press('l');
  await page.getByRole('button', { name: 'Patrol', exact: true }).click();
  const every = page.getByTestId('loop-composer-watchdog').getByRole('combobox', { name: 'Every' });
  await every.scrollIntoViewIfNeeded();
  await every.click();
  await expect(page.getByRole('option', { name: '1m', exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/cadence-dropdown.png` });
});
