import { expect, test, type Page } from '@playwright/test';
import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  REPRODUCIBLE_NOW_MS,
  setShotViewport,
  shotPath,
} from './shots-helper';

const OUT = '/tmp/battery-shots';

const data: MockFixtures = {
  ...fixtures,
  metricsSamples: [
    {
      at: REPRODUCIBLE_NOW_MS,
      battery: {
        percent: 85,
        hasBattery: true,
        isCharging: true,
        devices: [
          { id: 'internal', name: 'MacBook Pro', type: 'internal', percent: 85, isCharging: true },
          { id: 'headphones-1', name: 'AirPods Pro', type: 'headphones', percent: 92 },
          { id: 'keyboard-1', name: 'Magic Keyboard', type: 'keyboard', percent: 58 },
          { id: 'trackpad-1', name: 'Magic Trackpad', type: 'trackpad', percent: 18 },
        ],
      },
    },
  ],
};

async function setupPage(page: Page, overrides?: Partial<MockFixtures>): Promise<void> {
  await installMockBridge(page, { ...data, ...overrides });
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
  await page.waitForTimeout(300);
}

test('capture battery widget screenshots', async ({ page }) => {
  await setShotViewport(page, { width: 1200, height: 700 });
  await setupPage(page);

  const bar = page.getByTestId('status-bar');
  await expect(bar).toBeVisible();

  // 1. High tier (green) in status bar
  await bar.screenshot({ path: shotPath(OUT, 'battery-status-bar-green.png') });

  // 2. Open popover panel
  const triggerBtn = page.getByTestId('battery-segment');
  await triggerBtn.click();
  const panel = page.getByTestId('battery-panel');
  await expect(panel).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: shotPath(OUT, 'battery-popover-open.png') });
  await page.keyboard.press('Escape');

  // 3. Low tier (red with glow)
  await setupPage(page, {
    metricsSamples: [
      {
        at: REPRODUCIBLE_NOW_MS,
        battery: {
          percent: 18,
          hasBattery: true,
          isCharging: false,
          devices: [
            { id: 'internal', name: 'MacBook Pro', type: 'internal', percent: 18 },
          ],
        },
      },
    ],
  });
  await expect(page.getByTestId('battery-trigger')).toHaveAttribute('data-tier', 'low');
  await bar.screenshot({ path: shotPath(OUT, 'battery-status-bar-red-glow.png') });
});
