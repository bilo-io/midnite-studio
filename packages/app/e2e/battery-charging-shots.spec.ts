import { expect, test } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fixtures,
  installMockBridge,
  REPRODUCIBLE_NOW_MS,
  setShotViewport,
  setTheme,
} from './shots-helper';

const OUT = fileURLToPath(new URL('../../../docs/screenshots/battery-charging', import.meta.url));

test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');

test('capture battery charging screenshots', async ({ page }) => {
  await setShotViewport(page, { width: 1200, height: 750 });
  await page.addInitScript(() => {
    localStorage.setItem(
      'midnite.weather',
      JSON.stringify({
        state: {
          location: { name: 'London', latitude: 51.5, longitude: -0.13, country: 'United Kingdom' },
          unit: 'celsius',
        },
        version: 1,
      }),
    );
  });

  await installMockBridge(page, {
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
          ],
        },
      },
    ],
  });

  // Dark theme - title bar
  await setTheme(page, 'dark');
  await page.goto('/');
  const triggerDark = page.getByTestId('battery-trigger');
  await expect(triggerDark).toBeVisible();
  await expect(page.getByTestId('battery-charging-bolt')).toBeVisible();
  await page.waitForTimeout(300);
  await triggerDark.screenshot({ path: path.join(OUT, 'battery-titlebar-charging-dark.png') });

  // Light theme - title bar
  await setTheme(page, 'light');
  await page.waitForTimeout(300);
  await triggerDark.screenshot({ path: path.join(OUT, 'battery-titlebar-charging-light.png') });

  // Dark theme - screensaver / lock screen widget
  await setTheme(page, 'dark');
  await page.getByRole('button', { name: 'Lock screen' }).click();
  const lockBattery = page.getByTestId('lock-battery-widget');
  await expect(lockBattery).toBeVisible();
  await expect(lockBattery.getByTestId('battery-charging-bolt')).toBeVisible();
  await page.waitForTimeout(300);
  await lockBattery.screenshot({ path: path.join(OUT, 'battery-screensaver-charging-dark.png') });

  // Light theme - screensaver / lock screen widget
  await setTheme(page, 'light');
  await page.waitForTimeout(300);
  await lockBattery.screenshot({ path: path.join(OUT, 'battery-screensaver-charging-light.png') });
});
