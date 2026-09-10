import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  prepareForVisualCapture,
  REPRODUCIBLE_NOW_MS,
  setShotViewport,
} from '../shots-helper';

/**
 * The status-bar battery trigger's colour tiers.
 *
 * `battery-segment.test.tsx` proves `data-tier` flips at the right
 * percentages with plain DOM assertions; it cannot prove the tier's colour
 * (and, at the low tier, its glow) actually reads as red rather than merely
 * carrying the right attribute. That gap is exactly what a locator crop
 * closes — same fixture shape `battery-shots.spec.ts` (an existing ad hoc,
 * `MSTUDIO_SHOTS`-gated spec) already uses for its own throwaway `/tmp`
 * captures, reused here as a committed baseline instead.
 */
async function openWithBattery(page: Page, overrides: Partial<MockFixtures>): Promise<void> {
  const data: MockFixtures = { ...fixtures, ...overrides };
  await installMockBridge(page, data);
  await setShotViewport(page, { width: 1200, height: 700 });
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

test('the high tier, charging (green)', async ({ page }) => {
  await openWithBattery(page, {
    metricsSamples: [
      {
        at: REPRODUCIBLE_NOW_MS,
        battery: {
          percent: 85,
          hasBattery: true,
          isCharging: true,
          devices: [{ id: 'internal', name: 'MacBook Pro', type: 'internal', percent: 85, isCharging: true }],
        },
      },
    ],
  });
  await expect(page.getByTestId('battery-trigger')).toHaveAttribute('data-tier', 'high');
  await prepareForVisualCapture(page);

  await expect(page.getByTestId('battery-trigger')).toHaveScreenshot('battery-trigger-high.png');
});

test('the low tier, on battery (red, with glow)', async ({ page }) => {
  await openWithBattery(page, {
    metricsSamples: [
      {
        at: REPRODUCIBLE_NOW_MS,
        battery: {
          percent: 18,
          hasBattery: true,
          isCharging: false,
          devices: [{ id: 'internal', name: 'MacBook Pro', type: 'internal', percent: 18 }],
        },
      },
    ],
  });
  await expect(page.getByTestId('battery-trigger')).toHaveAttribute('data-tier', 'low');
  await prepareForVisualCapture(page);

  await expect(page.getByTestId('battery-trigger')).toHaveScreenshot('battery-trigger-low-glow.png');
});
