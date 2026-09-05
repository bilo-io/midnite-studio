import { expect, test } from '@playwright/test';

import { createShotTaker, fixtures, installMockBridge, setTheme } from './shots-helper';

/**
 * The screenshots for Phase 58 — the quick-access menu from both entry
 * points, and the Notes modal — light and dark.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, so the normal suite stays
 * fast and does not rewrite committed images on every run.
 */

/** Relative to `packages/app`, Playwright's cwd — hence the `../../`. */
const OUT = '../../docs/screenshots/p58-efg';

test.beforeEach(async ({ page }) => {
  test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to regenerate');
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
});

/** `animations: 'disabled'`, so the gradient ring's spin is settled in every shot. */
const shoot = createShotTaker(OUT, { animations: 'disabled' });

for (const mode of ['light', 'dark'] as const) {
  test(`the quick-access menu from the FAB (${mode})`, async ({ page }) => {
    if (mode === 'dark') await setTheme(page, 'dark');

    await page.getByRole('button', { name: 'Open quick access panel' }).click();
    await expect(page.getByTestId('quick-access-menu')).toBeVisible();
    await page.waitForTimeout(200);
    await shoot(page, `quick-access-fab-${mode}`);
  });

  test(`the quick-access menu from the assistant menu (${mode})`, async ({ page }) => {
    if (mode === 'dark') await setTheme(page, 'dark');

    await page.getByTestId('assistant-menu').click();
    await expect(page.getByTestId('quick-access-menu')).toBeVisible();
    await page.waitForTimeout(200);
    await shoot(page, `quick-access-assistant-menu-${mode}`);
  });

  test(`the Notes modal, with notes (${mode})`, async ({ page }) => {
    if (mode === 'dark') await setTheme(page, 'dark');

    await page.getByRole('button', { name: 'Open quick access panel' }).click();
    await page.keyboard.press('n');
    const modal = page.getByTestId('notes-modal');
    await expect(modal).toBeVisible();

    const composer = page.getByTestId('notes-composer');
    await composer.fill('the retry logic here is wrong, look at it later');
    await composer.press('Enter');
    await composer.fill('draft the settings redesign plan');
    await composer.press('Enter');
    await page.getByRole('checkbox', { name: 'Mark note completed' }).first().check();

    await page.waitForTimeout(200);
    await shoot(modal, `notes-modal-${mode}`);
  });
}
