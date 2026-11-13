import { expect, test, type Page } from '@playwright/test';

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
    await page.waitForTimeout(1500); // allow-timeout: proves a negative (nothing may happen in this window)

    expect(external.filter((url) => url.includes('ipwho.is'))).toHaveLength(0);
    expect(external.filter((url) => url.includes('twelvedata.com'))).toHaveLength(0);
    expect(external.filter((url) => url.includes('coingecko.com'))).toHaveLength(0);
  });

  /**
   * Phase 115 Theme A — with "Turn off all automatic network" on, an idle dashboard puts no request on the
   * wire to any host. The control runs the same dashboard with the master off and expects the Gravatar picture
   * request for a commit author to go out, so a passing negative cannot just mean the harness sees nothing.
   *
   * Browser capability: real `page.on('request')` network interception over an idle window of a real page.
   */
  const seedMaster = async (page: Page, allAutomaticOff: boolean) => {
    await page.addInitScript((off: boolean) => {
      const stored = window.localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 14 };
      persisted.state = { ...persisted.state, egressAllAutomaticOff: off };
      window.localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    }, allAutomaticOff);
  };
  const watchExternal = (page: Page): string[] => {
    const external: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (/^(https?:\/\/(127\.0\.0\.1|localhost)|data:|blob:|ws:|about:)/.test(url)) return;
      external.push(url);
    });
    return external;
  };

  test('the master switch stops every automatic request over an idle dashboard', async ({ page }) => {
    test.setTimeout(60_000);
    const external = watchExternal(page);
    await seedMaster(page, true);
    await installMockBridge(page, { ...fixtures });
    await page.goto('/');
    await expect(page.getByTestId('finance-segment')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(30_000); // allow-timeout: proves a negative (nothing may leave in this window)
    expect(external).toEqual([]);
  });

  test('control: the same idle dashboard loads author pictures when the master is off', async ({ page }) => {
    const external = watchExternal(page);
    await seedMaster(page, false);
    await installMockBridge(page, { ...fixtures });
    await page.goto('/');
    await expect.poll(() => external.filter((url) => url.startsWith('https://gravatar.com')).length, { timeout: 15_000 }).toBeGreaterThan(0);
  });
});
