import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, SHOT_VIEWPORTS } from './shots-helper';

/**
 * Phase 101 Theme D screenshots: the General MIDI instrument picker with its cached / download
 * badges and the sample credits, mounted in Settings ▸ Media ▸ Audio. Real browser capability
 * needed for the shot itself (pixels); behaviour is covered by vitest.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, like every `*-shots.spec.ts`.
 */
const OUT = '../../docs/screenshots/p101-d';

async function openLibrary(page: Page): Promise<void> {
  await installShotsBridge(page, { media: { gmCached: [0, 4, 24, 32, 40, 48, 56, 73] } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.mouse.move(900, 500); // collapse the hover-expanded rail so it stops covering the page
  await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'Media' }).click();
  await page.getByRole('button', { name: /^Audio/ }).click();
  await expect(page.getByTestId('gm-instrument-library')).toBeVisible();
  await page.getByTestId('gm-instrument-library').scrollIntoViewIfNeeded();
}

test.describe('Phase 101 D — GM instrument picker screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.default });

  test('picker with cached badges, light', async ({ page }) => {
    await openLibrary(page);
    await page.waitForTimeout(300);
    await page.getByTestId('gm-instrument-library').screenshot({ path: `${OUT}/picker-light.png` });
  });

  test('missing instrument shows the not-downloaded hint, dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openLibrary(page);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await page.getByRole('option', { name: /Tuba/ }).click();
    await expect(page.getByTestId('gm-instrument-library').getByRole('status')).toContainText('Not downloaded');
    await page.waitForTimeout(400);
    await page.getByTestId('gm-instrument-library').screenshot({ path: `${OUT}/picker-missing-dark.png` });
  });
});
