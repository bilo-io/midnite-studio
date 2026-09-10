import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, prepareForVisualCapture, setTheme } from '../shots-helper';

/**
 * The Appearance settings page's "Light palettes" swatch row, in both
 * themes — a colour/theme-token check that was a natural fit for the DOM
 * assertions the taxonomy calls "category D": every swatch's background is a
 * `StudioPalette`'s own HSL tokens, and a computed-style assertion can only
 * check one CSS custom property at a time, one swatch at a time, while a
 * crop of the whole row catches every swatch, its spacing and its selected-
 * ring state in one comparison.
 *
 * `theme-palette-shots.spec.ts` (an existing, ungated-by-this-theme ad hoc
 * spec) captures the whole accordion for a human to look at; this crops just
 * the swatch row itself, which is the part that is actually a colour token
 * check rather than a layout one.
 */
async function openAppearanceSettings(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await page.getByRole('radiogroup', { name: 'Light palettes' }).waitFor();
}

for (const theme of ['light', 'dark'] as const) {
  test(`the Light palettes swatch row (${theme})`, async ({ page }) => {
    await openAppearanceSettings(page);
    if (theme === 'dark') await setTheme(page, 'dark');
    await prepareForVisualCapture(page);

    await expect(page.getByRole('radiogroup', { name: 'Light palettes' })).toHaveScreenshot(
      `light-palettes-${theme}.png`,
    );
  });
}
