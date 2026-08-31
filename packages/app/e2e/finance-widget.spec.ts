import { expect, test, type Page, type Route } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The finance footer segment and its watchlist panel — the app's only surface
 * that calls out to a real external API (CoinGecko/Twelve Data) directly from
 * the renderer rather than through `window.midniteStudio`. Routed at the
 * network layer instead, since the mock bridge has nothing to do with it.
 */
async function mockCoinGecko(page: Page): Promise<void> {
  await page.route('https://api.coingecko.com/api/v3/search**', (route: Route) =>
    route.fulfill({
      json: { coins: [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin' }] },
    }),
  );
  await page.route('https://api.coingecko.com/api/v3/coins/bitcoin?**', (route: Route) =>
    route.fulfill({
      json: {
        name: 'Bitcoin',
        market_data: {
          current_price: { usd: 50000 },
          high_24h: { usd: 51000 },
          low_24h: { usd: 49000 },
          price_change_24h: 500,
          price_change_percentage_24h: 1.01,
        },
      },
    }),
  );
  await page.route('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart**', (route: Route) =>
    route.fulfill({
      json: {
        prices: [
          [1_700_000_000_000, 45000],
          [1_700_300_000_000, 47000],
          [1_700_600_000_000, 50000],
        ],
      },
    }),
  );
}

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

  test('adding a coin renders it with a 7-day sparkline, USD price, and a colored up arrow', async ({
    page,
  }) => {
    await mockCoinGecko(page);
    await installMockBridge(page, { ...fixtures });
    await page.goto('/');

    await page.getByTestId('finance-segment').click();
    const panel = page.getByTestId('finance-segment-panel');

    await panel.getByPlaceholder('Search coins…').fill('bit');
    await expect(panel.getByRole('button', { name: /Bitcoin \(BTC\)/ })).toBeVisible();
    await panel.getByRole('button', { name: /Bitcoin \(BTC\)/ }).click();

    await panel.getByRole('button', { name: 'Done editing' }).click();

    await expect(panel.getByText('$50,000.00')).toBeVisible();
    await expect(panel.getByText('+11.11%')).toBeVisible();
    await expect(panel.locator('svg polyline')).toHaveCount(1);

    // The footer trigger itself picks up the headline ticker and sparkline too.
    const trigger = page.getByTestId('finance-segment');
    await expect(trigger).toContainText('BTC');
    await expect(trigger).toContainText('$50,000.00');
    await expect(trigger.locator('svg polyline')).toHaveCount(1);

    await page.waitForTimeout(200);
    await page.getByTestId('status-bar').screenshot({ path: '/tmp/finance-footer.png' });
    await panel.screenshot({ path: '/tmp/finance-panel.png' });
  });
});
