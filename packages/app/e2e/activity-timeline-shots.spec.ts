import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Committed screenshots for the commit-activity timeline: the vertical panel
 * in each of its three styles, the horizontal strip above the status bar in
 * two of them, and the three drawing options that only the chart shows —
 * gridlines, side-by-side churn bars, and the hover tooltip — in both themes.
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

/** One frame: the store state to seed, and what to do before the shutter. */
interface Shot {
  style: string;
  orientation: string;
  /** Rules across the time axis, at the timeframe's cadence. */
  gridlines?: boolean;
  /** `grouped` stands the churn bars side by side instead of diverging. */
  barLayout?: string;
  /** Hover the newest bucket before shooting, so the tooltip is in frame. */
  hover?: boolean;
  /** Suffix distinguishing this shot from the plain one for the same style. */
  name?: string;
}

/**
 * Style, orientation and the two drawing options are all Settings preferences,
 * so each shot seeds them the way `busy-spinner-shots.spec.ts` seeds the write
 * consent — through the persisted store, before the app boots — rather than
 * clicking through the settings view in every screenshot.
 */
async function land(page: Page, theme: 'light' | 'dark', prefs: Shot): Promise<void> {
  if (theme === 'dark') await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript((seeded) => {
    window.localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({
        state: {
          activityTimelineOpen: true,
          activityTimelineStyle: seeded.style,
          activityTimelineOrientation: seeded.orientation,
          activityTimelineGridlines: seeded.gridlines ?? false,
          activityBarLayout: seeded.barLayout ?? 'diverging',
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
  if (prefs.hover) {
    // The newest bucket, which the fixture guarantees is a busy one.
    await page.getByTestId('activity-hit').last().hover();
    await expect(page.getByTestId('activity-tooltip')).toBeVisible();
  }
}

const SHOTS: Shot[] = [
  { style: 'bars', orientation: 'vertical' },
  { style: 'heatmap', orientation: 'vertical' },
  { style: 'sparkline', orientation: 'vertical' },
  { style: 'bars', orientation: 'horizontal' },
  { style: 'sparkline', orientation: 'horizontal' },
  { style: 'bars', orientation: 'horizontal', gridlines: true, name: 'gridlines' },
  { style: 'bars', orientation: 'horizontal', barLayout: 'grouped', name: 'grouped' },
  {
    style: 'bars',
    orientation: 'horizontal',
    gridlines: true,
    barLayout: 'grouped',
    name: 'grouped-gridlines',
  },
  { style: 'bars', orientation: 'horizontal', gridlines: true, hover: true, name: 'tooltip' },
  { style: 'heatmap', orientation: 'vertical', hover: true, name: 'tooltip' },
];

test.describe('activity timeline screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');

  for (const theme of ['light', 'dark'] as const) {
    for (const shot of SHOTS) {
      const slug = [shot.orientation, shot.style, shot.name].filter(Boolean).join('-');
      test(`${slug} ${theme}`, async ({ page }) => {
        await land(page, theme, shot);
        await page.screenshot({ path: `${OUT}/${slug}-${theme}.png` });
      });
    }
  }
});
