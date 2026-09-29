import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Phase 98 Theme C — Skip hands the user off to the FAB, and the FAB's
 * Resume setup leaf brings them back.
 *
 * Genuinely needs a real browser, not jsdom (docs/TESTING.md's "real
 * layout / getBoundingClientRect" arm): the arrow is positioned from the
 * FAB's live `getBoundingClientRect()`, which jsdom reports as all zeros, and
 * what this proves is that it lands aimed at the real FAB in the assembled
 * app's real layout — and that the overlay then actually gets out of the way
 * so that FAB can be clicked. The handoff's phases, its wording with the FAB
 * hidden, and the resume-page rule are all vitest (`setup-overlay.test.tsx`,
 * `setup-machine.test.ts`, `setup-choreography.test.ts`).
 */
test('Skip points an arrow at the FAB, gets out of the way, and Resume setup reopens past the skipped page', async ({ page }) => {
  await installMockBridge(page, { ...fixtures, firstRun: true });
  await page.goto('/');

  const overlay = page.getByTestId('setup-overlay');
  await overlay.getByRole('button', { name: 'Begin setup' }).click();
  await expect(overlay).toHaveAttribute('data-step', 'machine');
  await overlay.getByRole('button', { name: 'Skip' }).click();

  await expect(page.getByText('You can always continue setup from here')).toBeVisible();
  const arrow = page.getByTestId('setup-handoff-arrow');
  await expect(arrow).toBeVisible();

  // The arrow sits just up and to the left of the FAB, its point at the FAB's
  // top-left corner (give or take the nudge animation's 5px travel).
  const fab = (await page.getByTestId('fab-button').boundingBox())!;
  const tip = (await arrow.boundingBox())!;
  const tipRight = tip.x + tip.width;
  const tipBottom = tip.y + tip.height;
  expect(tipRight).toBeLessThanOrEqual(fab.x + 2);
  expect(tipRight).toBeGreaterThan(fab.x - 24);
  expect(tipBottom).toBeLessThanOrEqual(fab.y + 2);
  expect(tipBottom).toBeGreaterThan(fab.y - 24);

  // The stand-in the overlay shows sits exactly over the real FAB, so the
  // dissolve reveals the real one in the same place.
  const standIn = (await page.getByTestId('setup-handoff-fab').boundingBox())!;
  expect(Math.abs(standIn.x - fab.x)).toBeLessThan(1);
  expect(Math.abs(standIn.y - fab.y)).toBeLessThan(1);

  // Any click lets it go, and the real FAB is then clickable.
  await page.mouse.click(40, 200);
  await expect(overlay).toHaveCount(0);
  await page.getByTestId('fab-button').click();
  await page.getByTestId('quick-access-row-s').click();

  // Skipped on `machine`, so it resumes on the page after — straight onto the
  // page, not the intro.
  await expect(page.getByTestId('setup-overlay')).toHaveAttribute('data-step', 'forges');
});
