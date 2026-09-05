import { expect, test, type Page } from '@playwright/test';

import {
  DAY_S,
  fixtures,
  installShotsBridge,
  type MockFixtures,
  REPRODUCIBLE_NOW_S,
  setTheme,
  shotPath,
} from './shots-helper';

/**
 * Committed screenshots for the commit-activity timeline: the vertical panel
 * in each of its three styles, the horizontal strip above the status bar in
 * two of them, the twelve-month Year view, and the drawing options that only
 * the chart shows — gridlines, side-by-side churn bars, stacked churn areas,
 * and the hover tooltip — in both themes.
 *
 * Gated behind `MSTUDIO_SHOTS` like every other shots suite — committed
 * images, not assertions a normal `app:e2e` run must keep passing.
 */

const OUT = '../../docs/screenshots/adhoc-activity-timeline';

const nowS = REPRODUCIBLE_NOW_S;

/** A busy-looking week, so every bucket style has something to say. */
const TIMELINE = Array.from({ length: 40 }, (_, i) => ({
  sha: String(i).padStart(40, 'f'),
  at: nowS - ((i * i * 997) % (7 * DAY_S)),
  additions: (i * 37) % 220,
  deletions: (i * 17) % 90,
}));

/**
 * A year of commits, for the Year shots — the week fixture above would draw
 * eleven empty months and say nothing about the month buckets.
 */
const YEAR_TIMELINE = Array.from({ length: 260 }, (_, i) => ({
  sha: String(i).padStart(40, 'e'),
  at: nowS - ((i * i * 8_641) % (350 * DAY_S)),
  additions: (i * 53) % 400,
  deletions: (i * 29) % 160,
}));

const dataFor = (timeframe: string | undefined): MockFixtures => {
  const timeline = timeframe === 'year' ? YEAR_TIMELINE : TIMELINE;
  return { ...fixtures, stats: { timeline, commitsScanned: timeline.length } };
};

/** One frame: the store state to seed, and what to do before the shutter. */
interface Shot {
  style: string;
  orientation: string;
  /** Rules across the time axis, at the timeframe's cadence. */
  gridlines?: boolean;
  /** `grouped` stands the churn bars side by side instead of diverging. */
  barLayout?: string;
  /** `stacked` sits the additions area on top of the deletions one. */
  areaLayout?: string;
  /** `year` widens the window to twelve calendar months, bucketed by month. */
  timeframe?: string;
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
  await setTheme(page, theme);
  await page.addInitScript((seeded) => {
    window.localStorage.setItem(
      'midnite-studio.ui',
      JSON.stringify({
        state: {
          activityTimelineOpen: true,
          activityTimelineStyle: seeded.style,
          activityTimelineOrientation: seeded.orientation,
          activityTimelineGridlines: seeded.gridlines ?? false,
          activityTimelineBarLayout: seeded.barLayout ?? 'diverging',
          activityTimelineAreaLayout: seeded.areaLayout ?? 'overlaid',
          activityTimeframe: seeded.timeframe ?? 'week',
        },
        version: 6,
      }),
    );
  }, prefs);
  await installShotsBridge(page, dataFor(prefs.timeframe));
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
  if (theme === 'dark') {
    await setTheme(page, 'dark');
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
  { style: 'area', orientation: 'vertical' },
  { style: 'bars', orientation: 'horizontal' },
  { style: 'area', orientation: 'horizontal' },
  { style: 'area', orientation: 'horizontal', areaLayout: 'stacked', name: 'stacked' },
  { style: 'area', orientation: 'vertical', areaLayout: 'stacked', name: 'stacked' },
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
  // The vertical cases for the two new drawings: `place()` swaps x and y, so a
  // broken swap is invisible in every horizontal frame above.
  { style: 'bars', orientation: 'vertical', gridlines: true, name: 'gridlines' },
  { style: 'bars', orientation: 'vertical', barLayout: 'grouped', name: 'grouped' },
  // The Year window: twelve month buckets, in each drawing and each
  // orientation, with the quarter rules on for two of them.
  { style: 'bars', orientation: 'horizontal', timeframe: 'year', name: 'year' },
  {
    style: 'bars',
    orientation: 'horizontal',
    timeframe: 'year',
    gridlines: true,
    name: 'year-gridlines',
  },
  { style: 'heatmap', orientation: 'horizontal', timeframe: 'year', name: 'year' },
  { style: 'area', orientation: 'horizontal', timeframe: 'year', name: 'year' },
  { style: 'bars', orientation: 'vertical', timeframe: 'year', gridlines: true, name: 'year-gridlines' },
  {
    style: 'heatmap',
    orientation: 'horizontal',
    timeframe: 'year',
    hover: true,
    name: 'year-tooltip',
  },
];

test.describe('activity timeline screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');

  for (const theme of ['light', 'dark'] as const) {
    for (const shot of SHOTS) {
      const slug = [shot.orientation, shot.style, shot.name].filter(Boolean).join('-');
      test(`${slug} ${theme}`, async ({ page }) => {
        await land(page, theme, shot);
        await page.screenshot({ path: shotPath(OUT, `${slug}-${theme}.png`) });
      });
    }
  }
});
