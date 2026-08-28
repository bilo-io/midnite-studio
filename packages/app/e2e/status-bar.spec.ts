import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * Phase 27 Theme C: the status bar as a three-column grid, not `ml-auto`/
 * `mr-auto` flex siblings.
 *
 * The regression this guards against is a wrapper element around a segment
 * that renders `null` — it would still occupy a `gap-3` slot, so the left
 * zone's own footprint must not depend on what the right zone has to show.
 * `toHaveCount(0)` on the absent segments would pass even with that bug, so
 * this asserts the left zone's actual measured width instead.
 */
test('the left zone footprint is unaffected by what the right zone renders', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  const leftZone = page.getByTestId('status-bar-left');
  await expect(leftZone).toBeVisible();
  const emptyRightZoneWidth = (await leftZone.boundingBox())!.width;

  // Now give the right zone something to render: a failing diagnostics
  // candidate and a live metrics sample, so both of its segments mount.
  await installMockBridge(page, {
    ...fixtures,
    diagnostics: { trust: { state: 'trusted', command: null, trustedAt: Date.now() } },
    metricsSamples: [{ at: Date.now(), cpu: 42, memory: 55, gpu: 30, disk: 72 }],
  });
  await page.goto('/');
  await expect(page.getByTestId('monitor-cluster')).toBeVisible();
  const populatedRightZoneWidth = (await leftZone.boundingBox())!.width;

  expect(populatedRightZoneWidth).toBeCloseTo(emptyRightZoneWidth, 0);
});
