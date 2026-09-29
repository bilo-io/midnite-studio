import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Phase 90 Theme K — the phase's one functional e2e (the decision rule's
 * "multi-view flow with focus order and a modal" arm, per docs/TESTING.md).
 *
 * Genuinely needs a real browser, not jsdom: `OnboardingModal` and
 * `FirstRunModal` are both `fixed inset-0` overlays that mount
 * *simultaneously* on a fresh profile (see `mock-bridge.ts`'s own
 * `seedOnboardedProfile` docblock) — which one is interactive depends on
 * real DOM paint order, not on either component's own state, and
 * `useFocusTrap` on each depends on real `Tab`/`document.activeElement`
 * behaviour jsdom does not implement. Every other onboarding assertion
 * (step content, the skip-records-itself store transition) already has
 * jsdom coverage; this is the one thing only a real browser can prove:
 * that stepping through the wizard, skipping its one optional step, and
 * dismissing the health-check modal underneath actually lands the user in
 * the ordinary app with no dialog left capturing focus or clicks.
 */
test('the wizard steps, its optional step is skippable, and the app reaches its normal state', async ({ page }) => {
  await installMockBridge(page, { ...fixtures, firstRun: true });
  await page.goto('/');

  /*
    `OnboardingModal` (`aria-label={step.title}`) and `FirstRunModal`
    (`aria-labelledby="first-run-title"`, whose heading also reads "Welcome
    to Midnite Studio") both mount on a fresh profile at once, so `name:`
    alone is ambiguous between them — the attribute selectors below pick
    the one Playwright's own strict-mode check just proved otherwise
    collide on, which is itself the DOM-order/paint-order fact this spec
    exists to exercise.
  */
  const wizard = page.locator('.z-dialog[role="dialog"][aria-label]');
  const healthCheck = page.locator('[role="dialog"][aria-labelledby="first-run-title"]');

  await expect(wizard).toHaveAttribute('aria-label', 'Welcome to Midnite Studio');
  // The first step is mandatory — no Skip button on it.
  await expect(wizard.getByRole('button', { name: 'Skip' })).toHaveCount(0);
  await expect(wizard.getByRole('button', { name: 'Back' })).toBeDisabled();

  await wizard.getByRole('button', { name: 'Continue' }).click();
  await expect(wizard).toHaveAttribute('aria-label', 'Connect your forges');
  await expect(wizard.getByRole('button', { name: 'Skip' })).toBeVisible();

  // Back returns to step one without losing the wizard — real focus-trap,
  // real re-render, not a route change.
  await wizard.getByRole('button', { name: 'Back' }).click();
  await expect(wizard).toHaveAttribute('aria-label', 'Welcome to Midnite Studio');
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await expect(wizard).toHaveAttribute('aria-label', 'Connect your forges');

  // Skip the one optional step — this is the last step, so skipping also
  // closes the wizard (`onboarding-modal.tsx`'s own `skip()`).
  await wizard.getByRole('button', { name: 'Skip' }).click();
  await expect(wizard).toHaveCount(0);

  // The wizard is gone, but the health-check `FirstRunModal` was mounted
  // underneath it the whole time (both gate independently on separate
  // persisted flags) — dismissing it is what actually reaches "normal state".
  await expect(healthCheck).toBeVisible();
  await healthCheck.getByRole('button', { name: 'Get Started' }).click();

  // No dialog left capturing focus, and the ordinary app is interactive.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
});
