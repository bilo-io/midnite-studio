import { expect, test, type Page, type Route } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

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

test.describe('lock screen widgets', () => {
  test('renders system monitor graphs and fintech cycle on lock screen', async ({ page }) => {
    await mockCoinGecko(page);
    await installMockBridge(page, {
      ...fixtures,
      metricsSamples: [
        {
          at: 1000,
          cpu: 40,
          memory: 60,
          gpu: 15,
          cpuInfo: { cores: 8, load1: 1.2 },
          battery: { hasBattery: true, percent: 76, isCharging: false, devices: [] },
        },
        {
          at: 2000,
          cpu: 45,
          memory: 62,
          gpu: 18,
          cpuInfo: { cores: 8, load1: 1.5 },
          battery: { hasBattery: true, percent: 76, isCharging: false, devices: [] },
        },
      ],
    });
    await page.goto('/');

    // Click the "Lock screen" button pinned at bottom of rail
    const lockButton = page.getByRole('button', { name: 'Lock screen' });
    await expect(lockButton).toBeVisible();
    await lockButton.click();

    const widgets = page.getByTestId('lock-screen-widgets');
    await expect(widgets).toBeVisible();

    const sysmon = page.getByTestId('lock-sysmon-widget');
    await expect(sysmon).toBeVisible();
    await expect(sysmon).toContainText('System Monitor');
    await expect(sysmon).toContainText('CPU');
    await expect(sysmon).toContainText('RAM');
    await expect(sysmon).toContainText('GPU');

    const fintech = page.getByTestId('lock-fintech-widget');
    await expect(fintech).toBeVisible();
    await expect(fintech).toContainText('Fintech Cycle');

    // Phase 46 Theme B — battery stacks above sysmon in the same bottom-right slot.
    const battery = page.getByTestId('lock-battery-widget');
    await expect(battery).toBeVisible();
    await expect(battery).toContainText('76%');
    const batteryBox = await battery.boundingBox();
    const sysmonBox = await sysmon.boundingBox();
    expect(batteryBox && sysmonBox && batteryBox.y < sysmonBox.y).toBe(true);

    await page.screenshot({ path: '/tmp/lock-screen-widgets.png' });
  });

  test('renders nothing for battery on a machine with no battery', async ({ page }) => {
    await mockCoinGecko(page);
    await installMockBridge(page, {
      ...fixtures,
      metricsSamples: [{ at: 1000, battery: { hasBattery: false, devices: [] } }],
    });
    await page.goto('/');

    await page.getByRole('button', { name: 'Lock screen' }).click();
    await expect(page.getByTestId('lock-sysmon-widget')).toBeVisible();
    await expect(page.getByTestId('lock-battery-widget')).toHaveCount(0);
  });

  test('renders nothing for weather until a location is set (Phase 46 Theme A)', async ({ page }) => {
    await mockCoinGecko(page);
    await installMockBridge(page, fixtures);
    await page.goto('/');

    await page.getByRole('button', { name: 'Lock screen' }).click();
    await expect(page.getByTestId('lock-screen-widgets')).toBeVisible();
    await expect(page.getByTestId('lock-weather-widget')).toHaveCount(0);
  });

  test('shows temperature, condition and location once a location is set', async ({ page }) => {
    await mockCoinGecko(page);
    await page.route('https://geocoding-api.open-meteo.com/v1/search**', (route) =>
      route.fulfill({
        json: { results: [{ name: 'London', latitude: 51.5, longitude: -0.13, country: 'United Kingdom' }] },
      }),
    );
    await page.route('https://api.open-meteo.com/v1/forecast**', (route) =>
      route.fulfill({ json: { current: { temperature_2m: 18.4, weather_code: 0 } } }),
    );
    await page.addInitScript(() => {
      window.localStorage.setItem(
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
    await installMockBridge(page, fixtures);
    await page.goto('/');

    await page.getByRole('button', { name: 'Lock screen' }).click();
    const weather = page.getByTestId('lock-weather-widget');
    await expect(weather).toBeVisible();
    await expect(weather).toContainText('18°C');
    await expect(weather).toContainText('Clear sky');
    await expect(weather).toContainText('London, United Kingdom');
  });
});
