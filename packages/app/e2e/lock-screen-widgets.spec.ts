import { expect, test, type Page, type Route } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * A GitHub remote on the fixture's one repo, plus a ready `gh` — matching
 * `forge-issues.spec.ts`'s own `REMOTES` shape. Needed because `reviews` is
 * one of `app.tsx`'s `FORGE_GATED_VIEWS`: without a GitHub remote,
 * `useForgeGateAvailable` reports `false` regardless of which repo is
 * selected, and the app's own redirect effect bounces `activeView` straight
 * back to `'graph'` before `ReviewsView` ever renders anything — the pill's
 * navigation would look like a no-op even though it landed.
 */
const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

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

  /**
   * Phase 46 Theme H — the open verification line was "every pill is
   * reachable and activatable by keyboard, with a visible focus ring". The
   * markup is already right (a real `<button>` with a `focus-visible` ring
   * and an `aria-label` naming the count and destination together,
   * `screensaver-stage.tsx`) — so this test is coverage first.
   *
   * Presses `Enter`, not `Space`, and no modifier chord — a modifier would
   * re-run the Phase 38 `ControlOrMeta` hazard for no gain, and the click
   * path itself is already covered by `pill-destinations.test.ts`. What is
   * uncovered is that the button is reachable *at all* while `LockScreen`'s
   * own `window` keydown listener is armed — and writing this test caught a
   * real instance of that: the listener's `keydown` bubbles past the pill
   * regardless of the pill's own `onClick`-only `stopPropagation()`, so
   * `Enter` raced the browser's keydown→click default action against
   * `LockScreen`'s generic "any key dismisses" handler. `screensaver-stage.tsx`
   * now stops that keydown from bubbling too, matching the click case.
   *
   * Needs a GitHub remote and a ready `gh` (`REMOTES` above) — `reviews` is
   * forge-gated, and the default `fixtures` has no remote at all, so without
   * this the app's own redirect effect would bounce `activeView` back to
   * `'graph'` before proving anything about the pill.
   */
  test('the my PRs pill is keyboard-reachable and navigates on Enter (Phase 46 Theme H)', async ({
    page,
  }) => {
    const data: MockFixtures = { ...fixtures, remotes: REMOTES, forge: { cli: { reason: 'ready' }, pulls: [] } };
    await mockCoinGecko(page);
    await installMockBridge(page, data);
    await page.goto('/');

    await page.getByRole('button', { name: 'Lock screen' }).click();
    await expect(page.getByTestId('lock-screen-widgets')).toBeVisible();

    const pill = page.getByRole('button', { name: /my PRs/i });
    await pill.focus();
    await expect(pill).toBeFocused();

    await page.keyboard.press('Enter');

    await expect(page.getByTestId('lock-screen-widgets')).toHaveCount(0);
    // Proof `setActiveView` landed on `'reviews'` and stayed there: the
    // selected repo (the default fixture's `repo-1`) now has a GitHub remote,
    // so `ReviewsList` — not the "select a repository" empty state — is what
    // actually renders.
    await expect(page.getByTestId('reviews-groups')).toBeVisible();
  });

  /**
   * Phase 46 Theme H — Themes E and G proved the JS half
   * (`useResolvedMotion`, `resolveSystemMotion`) and shot the pixels; nothing
   * asserted the CSS guard on the one animation unique to this surface.
   * `screensaver-sheen` is applied by `.screensaver-title` (`styles.css`),
   * not by a `.screensaver-sheen` class — the keyframe name and the class
   * name differ here.
   *
   * Pokes `data-motion` directly, the plain-attribute dialect, exactly as
   * `e2e/councils.spec.ts` does — deliberately not the `@media`
   * (OS-emulated) counterpart, which `councils.spec.ts` already covers at
   * the app level; a second copy on this surface would assert the same
   * mechanism twice.
   */
  test("the screensaver title's sheen animation stops under reduced motion (Phase 46 Theme H)", async ({
    page,
  }) => {
    await mockCoinGecko(page);
    await installMockBridge(page, fixtures);
    await page.goto('/');

    await page.getByRole('button', { name: 'Lock screen' }).click();
    const title = page.locator('.screensaver-title');
    await expect(title).toBeVisible();
    await expect(title).not.toHaveCSS('animation-name', 'none');

    await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
    await expect(title).toHaveCSS('animation-name', 'none');
  });
});
