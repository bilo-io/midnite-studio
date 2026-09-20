import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Phase 76 Theme D — a fresh profile makes no third-party network requests
 * until the user sets a weather location or enables IP geolocation.
 *
 * Browser capability: real `page.on('request')` over a full page load.
 */
test.describe('privacy network defaults', () => {
  test('makes zero external requests before location consent', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return;
      if (url.startsWith('https://api.open-meteo.com')) return;
      if (url.startsWith('https://geocoding-api.open-meteo.com')) return;
      external.push(url);
    });

    await installMockBridge(page, { ...fixtures });
    await page.goto('/');

    await expect(page.getByTestId('finance-segment')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);

    expect(external.filter((url) => url.includes('ipwho.is'))).toHaveLength(0);
    expect(external.filter((url) => url.includes('twelvedata.com'))).toHaveLength(0);
    expect(external.filter((url) => url.includes('coingecko.com'))).toHaveLength(0);
  });
});
