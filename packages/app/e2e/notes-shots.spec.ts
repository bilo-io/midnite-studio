import { expect, test } from '@playwright/test';

import { createShotTaker, fixtures, installMockBridge, setTheme } from './shots-helper';

/**
 * The screenshots for Phase 58 — the quick-access menu from both entry
 * points (the FAB button and the `Mod+l` chord — a status-bar button used to
 * be the second entry point; it was a redundant control and was removed),
 * and the Notes modal — light and dark. The Notes shots were later re-taken,
 * and one added, for the ad hoc pass that gave the composer a gradient
 * border and a resize grip, un-clamped the rows and put a drag handle on
 * them.
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

  test(`the quick-access menu from the Mod+L chord (${mode})`, async ({ page }) => {
    if (mode === 'dark') await setTheme(page, 'dark');

    await page.keyboard.press('Meta+l');
    await expect(page.getByTestId('quick-access-menu')).toBeVisible();
    await page.waitForTimeout(200);
    await shoot(page, `quick-access-chord-${mode}`);
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
    /*
      A note past three lines — the length the row used to clamp, and the one
      the composer's four-line default is sized for.
    */
    await composer.fill(
      'the write queue serialises per repo, but the watcher fans out per worktree, ' +
        'so a fetch across five checkouts still queues behind the slowest one; ' +
        'worth measuring before deciding whether the queue should be per worktree ' +
        'instead, since that changes what index.lock actually protects',
    );
    await composer.press('Enter');
    await page.getByRole('checkbox', { name: 'Mark note completed' }).last().check();

    // Focused, so the composer's gradient border and glow are in the shot.
    await composer.fill('a thought half-written');
    await page.waitForTimeout(200);
    await shoot(modal, `notes-modal-${mode}`);
  });

  test(`a note being edited in place (${mode})`, async ({ page }) => {
    if (mode === 'dark') await setTheme(page, 'dark');

    await page.getByRole('button', { name: 'Open quick access panel' }).click();
    await page.keyboard.press('n');
    const modal = page.getByTestId('notes-modal');
    await expect(modal).toBeVisible();

    const composer = page.getByTestId('notes-composer');
    await composer.fill(
      'the lane layout runs in main, so a 40k-commit repo never blocks the render ' +
        'thread — but the batch size is still a guess; find the one where the first ' +
        'paint lands under 200ms',
    );
    await composer.press('Enter');

    await page.getByTestId('note-body').first().dblclick();
    await expect(page.getByTestId('note-edit-input')).toBeVisible();

    await page.waitForTimeout(200);
    await shoot(modal, `notes-inline-editor-${mode}`);
  });
}
