import { expect, test } from '@playwright/test';
import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * The title bar battery widget.
 *
 * Phase 82 Theme C wave 5 moved this file's 3 tier tests and the
 * click-to-open-popover test to
 * `src/features/battery/battery-segment.bridge.test.tsx`, seeding
 * `useMetricsStore` directly instead of routing through the mock bridge's
 * `metricsSamples` fixture — the exact same store write `useMetricsStream`'s
 * `onSample` subscription performs, so nothing about the component's
 * reaction is weakened. The one test kept here is a smoke test that the
 * widget is reachable and renders through the real, assembled app.
 */

test.describe('Battery Title Bar Widget', () => {
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
});
