import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  setReducedMotion,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * The collapsed FAB with a loop live — before/after shots for the orbiting
 * halo that replaced the per-loop corner glows.
 *
 * A standalone spec on purpose: it is run once against `main` (the corners)
 * and once against the branch (the halo) from the same file, so the two shots
 * differ only in what the app draws. Reduced motion, so the ring and halo rest
 * at the same angle in both, and the panel is closed so the FAB is what the
 * frame is about. The clip is the FAB's wrapper padded out by 28px — the halo
 * (and before it the corners) lives OUTSIDE the button's own box.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-fab-orbit-halo';
const VARIANT = process.env['MSTUDIO_SHOT_VARIANT'] ?? 'after';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

const fab = (page: Page) => page.getByRole('button', { name: 'Open quick access panel' });
const closeFab = (page: Page) => page.getByRole('button', { name: 'Close quick access panel' });

/**
 * The FAB now opens the quick-access menu (Phase 58 Theme E), not the Loops
 * panel directly — its own `L` row does. Mnemonic-activate it rather than
 * clicking a second button, matching how a keyboard user reaches the panel.
 */
async function openLoops(page: Page): Promise<void> {
  await fab(page).click();
  await page.keyboard.press('l');
}

async function shotFab(page: Page, name: string): Promise<void> {
  const box = (await fab(page).boundingBox())!;
  const pad = 28;
  await page.waitForTimeout(300);
  await page.screenshot({
    path: shotPath(OUT, `${name}-${VARIANT}.png`),
    clip: { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 },
  });
}

for (const mode of ['light', 'dark'] as const) {
  test(`the collapsed FAB with a loop live, per tab, then waiting (${mode})`, async ({ page }) => {
    await open(page);
    if (mode === 'dark') await setTheme(page, 'dark');
    await setReducedMotion(page);

    await openLoops(page);
    await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeVisible();
    await page.getByTestId('loop-composer-guard').getByTestId('loop-start').click();
    await expect(page.getByTestId('loop-composer-guard').getByTestId('loop-stop')).toBeVisible();
    await expect(page.locator('.xterm-screen')).toHaveCount(1);

    for (const tab of ['Guard', 'Concepts', 'Develop', 'Patrol', 'Medic', 'Overhaul']) {
      await page.getByRole('button', { name: tab, exact: true }).click();
      await page.waitForTimeout(300);
      await closeFab(page).click(); // close
      await page.waitForTimeout(400);
      await shotFab(page, `${mode}-${tab.toLowerCase()}`);
      await openLoops(page); // reopen for the next tab
      await page.waitForTimeout(400);
    }

    await page.evaluate(() => {
      (window as unknown as { __mstudioPtyActivity: (p: string, a: string) => boolean }).__mstudioPtyActivity(
        'pty-1',
        'waiting',
      );
    });
    await closeFab(page).click();
    await page.waitForTimeout(400);
    await shotFab(page, `${mode}-waiting`);
  });
}
