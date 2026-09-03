import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Committed screenshots for the commit-activity timeline: the vertical panel
 * in each of its three styles, the horizontal strip above the status bar in
 * two of them, in both themes.
 *
 * Gated behind `MSTUDIO_SHOTS` like every other shots suite — committed
 * images, not assertions a normal `app:e2e` run must keep passing.
 */

const OUT = '../../docs/screenshots/adhoc-activity-timeline';

const DAY_S = 86_400;
const nowS = Math.floor(Date.now() / 1000);

/** A busy-looking week, so every bucket style has something to say. */
const TIMELINE = Array.from({ length: 40 }, (_, i) => ({
  sha: String(i).padStart(40, 'f'),
  at: nowS - ((i * i * 997) % (7 * DAY_S)),
  additions: (i * 37) % 220,
  deletions: (i * 17) % 90,
}));

const data: MockFixtures = {
  ...fixtures,
  stats: { timeline: TIMELINE, commitsScanned: TIMELINE.length },
};

/**
 * Style and orientation are Settings preferences, so each shot seeds them the
 * way `busy-spinner-shots.spec.ts` seeds the write consent — through the
 * persisted store, before the app boots — rather than clicking through the
 * settings view in every screenshot.
 */
async function land(
  page: Page,
  theme: 'light' | 'dark',
  prefs: { style: string; orientation: string },
): Promise<void> {
  if (theme === 'dark') await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript((seeded) => {
    window.localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({
        state: {
          activityTimelineOpen: true,
          activityTimelineStyle: seeded.style,
          activityTimelineOrientation: seeded.orientation,
        },
        version: 5,
      }),
    );
  }, prefs);
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
  if (theme === 'dark') {
    await page.evaluate(() => document.documentElement.classList.add('dark'));
  }
  await expect(page.getByTestId('commit-activity-chart')).toBeVisible();
  await page.waitForTimeout(300);
}

const SHOTS: { style: string; orientation: string }[] = [
  { style: 'bars', orientation: 'vertical' },
  { style: 'heatmap', orientation: 'vertical' },
  { style: 'sparkline', orientation: 'vertical' },
  { style: 'bars', orientation: 'horizontal' },
  { style: 'sparkline', orientation: 'horizontal' },
];

test.describe('activity timeline screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');

  for (const theme of ['light', 'dark'] as const) {
    for (const shot of SHOTS) {
      test(`${shot.orientation} ${shot.style} ${theme}`, async ({ page }) => {
        await land(page, theme, shot);
        await page.screenshot({
          path: `${OUT}/${shot.orientation}-${shot.style}-${theme}.png`,
        });
      });
    }
  }
});
