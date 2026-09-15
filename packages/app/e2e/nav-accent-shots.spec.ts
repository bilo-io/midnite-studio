import { expect, test } from '@playwright/test';

import { fixtures, installMockBridge, shotPath } from './shots-helper';

/**
 * Human-review captures for the configured primary accent regression.
 *
 * This needs a real browser because the bug is CSS cascade order between
 * palette-owned inline custom properties and `html[data-accent]` stylesheet
 * rules; jsdom cannot resolve that cascade into the active rail row's colour.
 */
test('configured accent tints the active navigation row', async ({ page }) => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to capture');
  const variant = process.env.MSTUDIO_NAV_ACCENT_SHOT ?? 'after';

  await installMockBridge(page, fixtures);
  await page.addInitScript(() => {
    localStorage.setItem(
      'midnite.settings',
      JSON.stringify({ state: { accent: 'violet' }, version: 2 }),
    );
  });
  await page.goto('/');

  const activeRow = page.locator('a[aria-current="page"]').first();
  await expect(activeRow).toBeVisible();
  await activeRow.screenshot({
    path: shotPath('../../docs/screenshots/adhoc-nav-accent', `${variant}.png`),
  });
});
