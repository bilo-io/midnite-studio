import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * The finance footer segment and its watchlist panel — the app's only surface
 * that calls out to a real external API (CoinGecko/Twelve Data) directly from
 * the renderer rather than through `window.midniteStudio`.
 *
 * Phase 82 Theme C wave 5 moved both tests here to
 * `src/features/finance/finance-segment.bridge.test.tsx`, mounting
 * `FinanceSegment` directly with `fetch` stubbed. One smoke test stays here,
 * proving the footer segment actually renders and opens through a real page
 * load.
 */
test.describe('finance footer', () => {
  test('shows a neutral trigger with an empty watchlist, opens the editor on click', async ({ page }) => {
    await installMockBridge(page, { ...fixtures });
    await page.goto('/');

    const trigger = page.getByTestId('finance-segment');
    await expect(trigger).toBeVisible();
    await expect(trigger).toContainText('Finance');

    await trigger.click();
    const panel = page.getByTestId('finance-segment-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByPlaceholder('Search coins…')).toBeVisible();
  });
});
