import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge } from './shots-helper';

/**
 * Settings ▸ Sidebar rail-destination accordions: tinted group blocks,
 * nested rows, hairline dividers. Needs a real browser for layout/CSS.
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/adhoc-sidebar-accordion-style';

async function open(page: Page): Promise<void> {
  await installShotsBridge(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Sidebar' })
    .click();
  await expect(page.getByTestId('rail-destinations')).toBeVisible();
}

test.describe('Settings ▸ Sidebar accordion screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: { width: 1400, height: 1900 } });

  for (const scheme of ['light', 'dark'] as const) {
    test(`rail destinations, ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      if (scheme === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.waitForTimeout(500);
      await page.getByTestId('rail-destinations').screenshot({ path: `${OUT}/${scheme}.png` });
    });
  }
});
