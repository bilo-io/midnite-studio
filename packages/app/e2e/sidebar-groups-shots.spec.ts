import { expect, test } from '@playwright/test';

import { installShotsBridge, setReducedMotion, shotPath } from './shots-helper';

/**
 * Settings > Sidebar rail destinations, for the PR body. Run with
 * `MSTUDIO_SHOTS=1 SHOTS_OUT=<dir>`; skipped otherwise, like every other
 * `*-shots.spec.ts`.
 */
test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

test('settings sidebar page, rail destinations', async ({ page }) => {
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({ state: { navMode: 'expanded' }, version: 23 }),
    ),
  );
  await installShotsBridge(page, {});
  await page.setViewportSize({ width: 1400, height: 1500 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Sidebar' })
    .click();
  await setReducedMotion(page);
  await page.waitForTimeout(400);
  await expect(page.getByText('Rail destinations')).toBeVisible();
  await page.screenshot({ path: shotPath(process.env['SHOTS_OUT'] ?? '../../docs/screenshots/adhoc-sidebar-groups', 'sidebar.png') });
});
