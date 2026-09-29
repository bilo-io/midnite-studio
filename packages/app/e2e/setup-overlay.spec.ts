import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Phase 98 Theme A — the setup overlay on a fresh profile, end to end.
 *
 * Genuinely needs a real browser, not jsdom (docs/TESTING.md's "focus order,
 * multi-view flow" arm): the overlay is a `fixed inset-0` surface over the
 * whole assembled app, and what this proves is that walking it and leaving it
 * actually hands a real, clickable app back — no layer left intercepting
 * pointer events, and real `Tab` focus trapped inside while it is up. The
 * frame's own navigation, gate and skip bookkeeping are vitest
 * (`setup-overlay.test.tsx`); this replaces Phase 90 Theme K's
 * `onboarding-wizard.spec.ts`, whose two stacked modals no longer exist.
 */
test('a fresh profile gets the setup overlay, can walk it, and lands in the app after Skip', async ({ page }) => {
  await installMockBridge(page, { ...fixtures, firstRun: true });
  await page.goto('/');

  const overlay = page.getByTestId('setup-overlay');
  await expect(overlay).toHaveAttribute('data-step', 'intro');
  // One surface, not two stacked ones.
  await expect(page.getByRole('dialog')).toHaveCount(1);

  // Real Tab focus stays inside the overlay.
  await overlay.getByRole('button', { name: 'Close setup' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(overlay.getByRole('button', { name: 'Skip' })).toBeFocused();

  await overlay.getByRole('button', { name: 'Begin setup' }).click();
  await expect(overlay).toHaveAttribute('data-step', 'machine');
  await page.keyboard.press('ArrowRight');
  await expect(overlay).toHaveAttribute('data-step', 'forges');
  await overlay.getByRole('button', { name: 'Back' }).click();
  await expect(overlay).toHaveAttribute('data-step', 'machine');

  await overlay.getByRole('button', { name: 'Skip' }).click();
  await expect(overlay).toHaveCount(0);

  // No dialog left capturing focus, and the ordinary app is interactive.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();

  // Left early, so it does not re-pop on reload.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(page.getByTestId('setup-overlay')).toHaveCount(0);
});
