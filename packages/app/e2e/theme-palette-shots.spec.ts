import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, setTheme, shotPath } from './shots-helper';

/**
 * The Phase 64 Theme E + F screenshots — the new "Palette" accordion on the
 * Appearance settings page (preset cards, the terminal/editor overrides, the
 * light/dark/system/time control, and the VS Code theme importer button).
 *
 * Not assertions — `palette.spec.ts` and `appearance-page.test.tsx` own
 * those. These exist to produce the PNGs the PR embeds, from the same
 * mocked bridge the rest of the suite uses.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, so the normal suite stays
 * fast and does not rewrite committed images on every run.
 */
const OUT = '../../docs/screenshots/p64-ef';

const SETTLE_MS = 300;

async function openAppearanceSettings(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Appearance', exact: true })
    .click();
  await page.getByRole('radiogroup', { name: 'Palette' }).waitFor();
  await page.waitForTimeout(SETTLE_MS);
}

test.describe('Phase 64 Theme E + F — Palette accordion screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: { width: 1280, height: 1400 } });

  test('the Palette accordion, light', async ({ page }) => {
    await openAppearanceSettings(page);
    await page.screenshot({ path: shotPath(OUT, 'appearance-palette-light.png') });
  });

  test('the Palette accordion, dark', async ({ page }) => {
    await installMockBridge(page, fixtures);
    await page.goto('/');
    // Set before navigating so the accordion's own first paint is already dark.
    await setTheme(page, 'dark');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page
      .getByRole('navigation', { name: 'Settings pages' })
      .getByRole('button', { name: 'Appearance', exact: true })
      .click();
    await page.getByRole('radiogroup', { name: 'Palette' }).waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'appearance-palette-dark.png') });
  });
});
