import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Terminal dock position (bottom / right).
 *
 * Real browser because the claims are about layout: the frame's
 * `getBoundingClientRect` sits beside the view rather than under it, and a
 * pointer drag on the frame's left-edge handle resizes it horizontally.
 */

test('the terminal docks right, resizes horizontally, and docks back to the bottom', async ({ page }) => {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await page.keyboard.press('Control+`');
  const frame = page.locator('[data-terminal-frame]');
  await expect(frame).toBeVisible();
  const bottom = await frame.boundingBox();
  expect(bottom!.width).toBeGreaterThan(bottom!.height);

  await page.getByLabel('Dock terminal to the right').click();
  await expect(page.getByLabel('Dock terminal to the bottom')).toBeVisible();
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(bottom!.height + 100);
  const right = (await frame.boundingBox())!;
  expect(right.width).toBeLessThan(right.height);

  const handle = page.getByRole('separator', { name: 'Resize terminal' });
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x - 120, hb.y + hb.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(right.width + 80);

  // Ctrl+` still toggles in the right-docked position.
  await page.keyboard.press('Control+`');
  await expect(frame).toHaveCount(0);
  await page.keyboard.press('Control+`');
  await expect(frame).toBeVisible();

  await page.getByLabel('Dock terminal to the bottom').click();
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeGreaterThan(right.width * 2);
});
