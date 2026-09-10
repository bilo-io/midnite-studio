import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, prepareForVisualCapture, seedRandom, setTheme } from '../shots-helper';

/**
 * The screensaver's typed-word heading, in both themes.
 *
 * This is Theme D's proof that the new determinism helpers actually hold, not
 * just that they exist: `useTypedWord` (`screensaver-stage.tsx`) picks its
 * word with an unseeded `Math.random()`, so without `seedRandom` this crop
 * would show a different word on every regeneration and never stabilise
 * against a committed baseline at all. `seedRandom` must run via
 * `addInitScript` before the app's own first render — so before
 * `installMockBridge`, not after — for the same reason `installMockBridge`
 * itself has to run before `page.goto`.
 *
 * No agents live and no PRs open in the base fixture, so the reading is
 * `idle` (`useScreensaverReading`) and the word comes from `IDLE_WORDS` —
 * deterministically, once seeded. The wait below is long enough for the
 * typewriter to finish even the longest word in any of the three lists
 * (`screensaver-words.ts`'s longest entries are ~30 characters at 65ms/char,
 * so under 2s) and land well before the 10s hold timer would pick a new one.
 */
async function openLockScreen(page: Page): Promise<void> {
  // Before goto: addInitScript ordering, same reason installMockBridge runs first.
  await seedRandom(page);
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.getByRole('button', { name: 'Lock screen' }).click();
  await expect(page.getByTestId('lock-screen-widgets')).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`the screensaver's typed word (${theme})`, async ({ page }) => {
    await openLockScreen(page);
    if (theme === 'dark') await setTheme(page, 'dark');
    await prepareForVisualCapture(page);
    // Let the typewriter finish (see the file header for the timing budget).
    await page.waitForTimeout(2_500);

    await expect(page.locator('.screensaver-title')).toHaveScreenshot(`screensaver-title-${theme}.png`);
  });
}
