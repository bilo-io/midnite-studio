import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  mockWeatherApi,
  REPRODUCIBLE_NOW_MS,
  setReducedMotion,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * Phase 46 Theme G — the committed, re-runnable screenshot spec its own doc
 * asks for: the full lock screen (weather top-centre, battery + sysmon
 * bottom-right, the navigating pills) in both motion modes and both themes.
 * PR #55 captured two ad hoc PNGs via a throwaway script for the PR body;
 * this replaces that with a spec `moon run app:e2e` can regenerate.
 *
 * No modifier chords are pressed here — the flow is a click plus two DOM
 * attribute overrides for theme/motion — so the Phase 38 `ControlOrMeta`
 * lesson has nothing to catch in this spec.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays
 * fast. Commit only this phase's shots and `git checkout --` the rest — a
 * full `app:e2e` run rewrites screenshots across the whole suite, since PNGs
 * are not byte-reproducible (see `outstanding.md`).
 */
const OUT = '../../docs/screenshots/p46-g-lock-screen';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await mockWeatherApi(page);
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
  await installMockBridge(page, {
    ...fixtures,
    metricsSamples: [
      {
        at: REPRODUCIBLE_NOW_MS,
        cpu: 40,
        memory: 60,
        gpu: 15,
        cpuInfo: { cores: 8, load1: 1.2 },
        battery: { hasBattery: true, percent: 76, isCharging: false, devices: [] },
      },
    ],
  } as never);
  await page.goto('/');

  await page.getByRole('button', { name: 'Lock screen' }).click();
  await expect(page.getByTestId('lock-screen-widgets')).toBeVisible();
  await expect(page.getByTestId('lock-weather-widget')).toBeVisible();
  await expect(page.getByTestId('lock-battery-widget')).toBeVisible();
}

for (const motion of ['full', 'reduced'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`lock screen — ${motion} motion, ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);
      await open(page);
      if (theme === 'dark') await setTheme(page, 'dark');
      await setReducedMotion(page, motion === 'reduced');
      await page.waitForTimeout(300);

      await page.screenshot({ path: shotPath(OUT, `lock-screen-${motion}-${theme}.png`) });
    });
  }
}
