import { expect, test } from '@playwright/test';
import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

test.describe('Battery Status Bar Widget', () => {
  test('renders green tier when battery is above 70%', async ({ page }) => {
    await installMockBridge(page, {
      ...fixtures,
      metricsSamples: [
        {
          at: Date.now(),
          battery: {
            percent: 85,
            hasBattery: true,
            isCharging: false,
            devices: [
              { id: 'internal', name: 'Computer', type: 'internal', percent: 85 },
            ],
          },
        },
      ],
    });
    await page.goto('/');

    const trigger = page.getByTestId('battery-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('data-tier', 'high');
    await expect(page.getByTestId('battery-segment')).toContainText('85%');
  });

  test('renders orange tier when battery is between 30% and 69%', async ({ page }) => {
    await installMockBridge(page, {
      ...fixtures,
      metricsSamples: [
        {
          at: Date.now(),
          battery: {
            percent: 45,
            hasBattery: true,
            isCharging: false,
            devices: [
              { id: 'internal', name: 'Computer', type: 'internal', percent: 45 },
            ],
          },
        },
      ],
    });
    await page.goto('/');

    const trigger = page.getByTestId('battery-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('data-tier', 'medium');
    await expect(page.getByTestId('battery-segment')).toContainText('45%');
  });

  test('renders red tier with glow when battery is below 30%', async ({ page }) => {
    await installMockBridge(page, {
      ...fixtures,
      metricsSamples: [
        {
          at: Date.now(),
          battery: {
            percent: 20,
            hasBattery: true,
            isCharging: false,
            devices: [
              { id: 'internal', name: 'Computer', type: 'internal', percent: 20 },
            ],
          },
        },
      ],
    });
    await page.goto('/');

    const trigger = page.getByTestId('battery-trigger');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('data-tier', 'low');
    await expect(page.getByTestId('battery-segment')).toContainText('20%');
  });

  test('clicking battery in status bar opens popover listing all connected devices', async ({ page }) => {
    await installMockBridge(page, {
      ...fixtures,
      metricsSamples: [
        {
          at: Date.now(),
          battery: {
            percent: 85,
            hasBattery: true,
            isCharging: true,
            devices: [
              { id: 'internal', name: 'MacBook Pro', type: 'internal', percent: 85, isCharging: true },
              { id: 'headphones-1', name: 'AirPods Pro', type: 'headphones', percent: 90 },
              { id: 'keyboard-1', name: 'Magic Keyboard', type: 'keyboard', percent: 60 },
              { id: 'trackpad-1', name: 'Magic Trackpad', type: 'trackpad', percent: 25 },
            ],
          },
        },
      ],
    });
    await page.goto('/');

    const triggerBtn = page.getByTestId('battery-segment');
    await expect(triggerBtn).toBeVisible();
    await triggerBtn.click();

    const panel = page.getByTestId('battery-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Battery & Connected Devices');
    await expect(panel).toContainText('MacBook Pro');
    await expect(panel).toContainText('AirPods Pro');
    await expect(panel).toContainText('Magic Keyboard');
    await expect(panel).toContainText('Magic Trackpad');
  });
});
