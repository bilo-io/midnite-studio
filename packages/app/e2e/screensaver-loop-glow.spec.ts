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

  // The FAB opens the quick-access menu (Phase 58 Theme E); its `L` row opens
  // the Loops panel this spec is actually after.
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeVisible();
  const composer = page.getByTestId('loop-composer-guard');
  await composer.getByTestId('loop-start').click();
  await expect(composer.getByTestId('loop-stop')).toBeVisible();

  await page.getByRole('button', { name: 'Lock screen' }).click();
  await expect(lockScreen(page)).toHaveAttribute('data-loops-running', 'true');
  await expect(lockScreen(page)).toHaveClass(/screensaver-panel-gradient/);

  // The glow is one arc orbiting the edge, not a full static ring. Only the
  // browser proves this half: `--fab-arc-from`/`--fab-arc-to` are registered
  // `inherits: false`, so the value has to land on the *pseudo* — read it off
  // `::before`'s computed style, where the mask actually consumes it, rather
  // than off the host, where it would resolve whether or not the rule works.
  const arc = await lockScreen(page).evaluate((el) => {
    const style = getComputedStyle(el, '::before');
    return {
      from: style.getPropertyValue('--fab-arc-from').trim(),
      to: style.getPropertyValue('--fab-arc-to').trim(),
    };
  });
  expect(arc).toEqual({ from: '-45deg', to: '45deg' });

  await lockScreen(page).click({ position: { x: 2, y: 2 } });
  await expect(lockScreen(page)).toHaveCount(0);

  // The FAB panel was never closed — dismissing the lock screen just reveals
  // it again, still open on the same tab, ready to stop the loop.
  await composer.getByTestId('loop-stop').click();

  await page.getByRole('button', { name: 'Lock screen' }).click();
  await expect(lockScreen(page)).toHaveAttribute('data-loops-running', 'false');
});
