import { expect, test } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/** Media header with the tab strip pinned right, for the PR. Run with `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/adhoc-media-tabs-right';

test.describe('media tabs right screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.board });

  test('header', async ({ page }) => {
    await installMockBridge(page, fixtures);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
    await expect(async () => {
      await clickRailLink(page, 'Media');
      await expect(page.getByRole('tablist', { name: 'Media' })).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5000 });
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'media.png') });
  });
});
