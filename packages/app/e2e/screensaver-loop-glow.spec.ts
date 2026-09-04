import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The screensaver's `.gradient-frame` inner glow (`.screensaver-panel-gradient`
 * in `styles.css`) — the same rim the FAB console and the landing page wear —
 * lit across the whole lock screen while any loop is running anywhere in the
 * FAB, off again once it stops. `lock-screen.test.tsx` owns the component-level
 * wiring; this is the one thing only the running app proves: that a loop
 * started from the FAB is still "running" once the lock screen — a wholly
 * separate mount, reading the same global loop store — takes over the screen.
 */

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

function lockScreen(page: Page) {
  return page.getByRole('dialog', { name: 'Screensaver' });
}

test('stays off while idle, lights up once a loop is running, off again once it stops', async ({ page }) => {
  await open(page);

  // A corner click dismisses rather than a keypress: once a loop is running
  // its xterm underneath holds DOM focus, and a keydown aimed at `.xterm`
  // never reaches the lock screen's own `window` listener. The corner is
  // empty background at every viewport this suite runs — `LockScreenChrome`'s
  // widgets sit `inset-8`, well clear of a couple of pixels from the edge.
  await page.getByRole('button', { name: 'Lock screen' }).click();
  await expect(lockScreen(page)).toHaveAttribute('data-loops-running', 'false');
  await lockScreen(page).click({ position: { x: 2, y: 2 } });
  await expect(lockScreen(page)).toHaveCount(0);

  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await expect(page.getByRole('button', { name: 'Ideate', exact: true })).toBeVisible();
  const composer = page.getByTestId('loop-composer-innovate');
  await composer.getByTestId('loop-start').click();
  await expect(composer.getByTestId('loop-stop')).toBeVisible();

  await page.getByRole('button', { name: 'Lock screen' }).click();
  await expect(lockScreen(page)).toHaveAttribute('data-loops-running', 'true');
  await expect(lockScreen(page)).toHaveClass(/screensaver-panel-gradient/);
  await lockScreen(page).click({ position: { x: 2, y: 2 } });
  await expect(lockScreen(page)).toHaveCount(0);

  // The FAB panel was never closed — dismissing the lock screen just reveals
  // it again, still open on the same tab, ready to stop the loop.
  await composer.getByTestId('loop-stop').click();

  await page.getByRole('button', { name: 'Lock screen' }).click();
  await expect(lockScreen(page)).toHaveAttribute('data-loops-running', 'false');
});
