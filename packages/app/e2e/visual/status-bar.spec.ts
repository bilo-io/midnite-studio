import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  prepareForVisualCapture,
  REPRODUCIBLE_NOW_MS,
  setTheme,
} from '../shots-helper';

/**
 * The status bar at full density, in both themes.
 *
 * A spacing/layout check as much as a colour one: `status-bar-shots.spec.ts`
 * (an existing ad hoc spec, `MSTUDIO_SHOTS`-gated) already establishes that
 * the bar's density and its segments' spacing are worth a human's eyes at
 * every breakpoint; this crop takes the single most representative one (full
 * width, nothing collapsed) as a machine-checked baseline rather than an
 * unbounded set of throwaway PNGs.
 */
const data: MockFixtures = {
  ...fixtures,
  diagnostics: {
    candidates: [{ id: 'eslint', label: 'ESLint' }],
    trust: { state: 'trusted', command: null, trustedAt: REPRODUCIBLE_NOW_MS },
    result: { total: 3 },
  },
  metricsSamples: [{ at: REPRODUCIBLE_NOW_MS, cpu: 42, memory: 55, gpu: 30, disk: 72 }],
};

async function open(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  test(`the status bar, full density (${theme})`, async ({ page }) => {
    await open(page);
    if (theme === 'dark') await setTheme(page, 'dark');
    await prepareForVisualCapture(page);

    await expect(page.getByTestId('status-bar')).toHaveScreenshot(`status-bar-full-${theme}.png`);
  });
}
