import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The four count pills on the lock screen navigate somewhere real (Phase 46
 * Theme C). The "agents" pill is the one exercised end to end here — it has
 * a real, stable selector (`[data-terminal-frame]`) unlike the others, and
 * the passcode-hold logic is destination-agnostic, so one destination proves
 * the mechanism.
 */

async function seedPasscode(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({
        state: { requirePasscode: true, passcode: '1234', passcodeOnlyWhenLocked: false },
        version: 6,
      }),
    );
  });
}

test.describe('lock screen pills', () => {
  test('without a passcode, a pill click navigates and closes the lock screen', async ({ page }) => {
    await installMockBridge(page, fixtures);
    await page.goto('/');

    await page.getByRole('button', { name: 'Lock screen' }).click();
    // No passcode set — `LockScreen`'s own `dismissible` posture, labelled
    // "Screensaver" rather than "Locked screen".
    await expect(page.getByRole('dialog', { name: 'Screensaver' })).toBeVisible();

    await page.getByRole('button', { name: /^0 agents/ }).click();

    await expect(page.getByRole('dialog', { name: 'Screensaver' })).toHaveCount(0);
    await expect(page.locator('[data-terminal-frame]')).toBeVisible();
  });

  test('behind a passcode, a pill click holds the destination until unlock', async ({ page }) => {
    await seedPasscode(page);
    await installMockBridge(page, fixtures);
    await page.goto('/');

    await page.getByRole('button', { name: 'Lock screen' }).click();
    await page.getByRole('button', { name: /^0 agents/ }).click();

    const pad = page.getByRole('dialog', { name: 'Enter passcode to unlock' });
    await expect(pad).toBeVisible();
    // Still locked, and the terminal has not opened yet — the pill's own
    // click must not have been swallowed by LockScreen's generic dismiss,
    // but it must not navigate early either.
    await expect(page.getByRole('dialog', { name: 'Locked screen' })).toBeVisible();
    await expect(page.locator('[data-terminal-frame]')).toHaveCount(0);

    for (const digit of '1234') {
      await page.keyboard.press(digit);
    }

    await expect(pad).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Locked screen' })).toHaveCount(0);
    await expect(page.locator('[data-terminal-frame]')).toBeVisible();
  });

  test('cancelling the pad drops the destination — no navigation, still locked', async ({ page }) => {
    await seedPasscode(page);
    await installMockBridge(page, fixtures);
    await page.goto('/');

    await page.getByRole('button', { name: 'Lock screen' }).click();
    await page.getByRole('button', { name: /^0 agents/ }).click();

    const pad = page.getByRole('dialog', { name: 'Enter passcode to unlock' });
    await expect(pad).toBeVisible();
    await pad.getByRole('button', { name: 'Close' }).click();

    await expect(pad).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Locked screen' })).toBeVisible();
    await expect(page.locator('[data-terminal-frame]')).toHaveCount(0);
  });
});
