import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, type MockFixtures, setReducedMotion, shotPath } from './shots-helper';

/**
 * The Loops tab bar, shortened to match `tab-strip.tsx` (the workbench's own
 * tab row) — before/after shots for the ad hoc task that re-laid it out:
 * icon-over-label stacked tabs became icon-beside-label rows, and the close
 * button moved from beside the detach slot to the far right of the row.
 *
 * The `*-before.png` shots beside this spec's own `*-after.png` output were
 * captured from a throwaway `origin/main` checkout with an equivalent,
 * un-committed spec — the `fab-panel-tabbar` testid this file clips to
 * postdates this task, so the same spec cannot run unmodified against `main`.
 * Reduced motion so the shimmer/arc rest rather than mid-sweep.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/adhoc-loops-tabbar';
const VARIANT = process.env['MSTUDIO_SHOT_VARIANT'] ?? 'after';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await setReducedMotion(page);
}

const fab = (page: Page) => page.getByRole('button', { name: 'Open quick access panel' });

async function openLoops(page: Page): Promise<void> {
  await fab(page).click();
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeVisible();
  await page.waitForTimeout(300);
}

test('the Loops tab bar, idle', async ({ page }) => {
  await open(page);
  await openLoops(page);

  await page.screenshot({
    path: shotPath(OUT, `idle-${VARIANT}.png`),
    clip: (await page.getByTestId('fab-panel-tabbar').boundingBox())!,
  });
});

test('the Loops tab bar with a loop running — the active arc overlay', async ({ page }) => {
  await open(page);
  await openLoops(page);

  await page.getByTestId('loop-composer-guard').getByTestId('loop-start').click();
  await expect(page.getByTestId('loop-composer-guard').getByTestId('loop-stop')).toBeVisible();
  await page.waitForTimeout(300);

  await page.screenshot({
    path: shotPath(OUT, `running-${VARIANT}.png`),
    clip: (await page.getByTestId('fab-panel-tabbar').boundingBox())!,
  });
});
