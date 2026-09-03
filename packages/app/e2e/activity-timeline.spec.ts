import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The commit-activity timeline as a panel in the running app.
 *
 * The unit tests own the arithmetic — bucketing, gridline cadence, the three
 * drawings, the axis swap. What only the running app can show is the wiring:
 * that the status-bar toggle actually raises the panel, that the chord reaches
 * it, that each header control moves the store field Settings shares with it
 * (D/W/M, the style icons, the gridline switch), that hovering a bucket raises
 * the tooltip and leaving the chart takes it away, and that a repository with
 * no timeline rows says "No commits" rather than drawing an empty chart.
 */

const DAY_S = 86_400;
const nowS = Math.floor(Date.now() / 1000);

/** Relative to the clock, because the panel buckets against `Date.now()`. */
const TIMELINE = [
  { sha: 'a'.repeat(40), at: nowS - 3_600, additions: 12, deletions: 3 },
  { sha: 'b'.repeat(40), at: nowS - 2 * DAY_S, additions: 5, deletions: 9 },
  { sha: 'c'.repeat(40), at: nowS - 6 * DAY_S, additions: 0, deletions: 4 },
];

const seeded: MockFixtures = {
  ...fixtures,
  stats: { timeline: TIMELINE, commitsScanned: TIMELINE.length },
};

async function open(page: Page, data: MockFixtures = seeded): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

test('the status-bar toggle raises the panel, vertical by default', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('commit-activity-panel')).toHaveCount(0);

  await page.getByTestId('activity-toggle').click();
  const panel = page.getByTestId('commit-activity-panel');
  await expect(panel).toBeVisible();
  // Vertical orientation = the axes swapped in the viewBox.
  await expect(panel.getByTestId('commit-activity-chart')).toHaveAttribute(
    'viewBox',
    '0 0 32 100',
  );
  await expect(page.getByTestId('activity-toggle')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('activity-toggle').click();
  await expect(page.getByTestId('commit-activity-panel')).toHaveCount(0);
});

test('the chord toggles it too', async ({ page }) => {
  await open(page);
  // Dispatched as a DOM event rather than `keyboard.press`: Ctrl+Shift+A is
  // Chromium's own "search tabs" accelerator on Linux, so on CI the real
  // keystroke never reaches the page. Electron has no such accelerator — the
  // chord works in the app; only the test harness's browser collides.
  const pressChord = () =>
    page.evaluate(() => {
      const mac = /mac/i.test(navigator.platform || navigator.userAgent);
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'A',
          code: 'KeyA',
          shiftKey: true,
          metaKey: mac,
          ctrlKey: !mac,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  await pressChord();
  await expect(page.getByTestId('commit-activity-panel')).toBeVisible();
  await pressChord();
  await expect(page.getByTestId('commit-activity-panel')).toHaveCount(0);
});

test('the D/W/M picker moves the window the chart announces', async ({ page }) => {
  await open(page);
  await page.getByTestId('activity-toggle').click();
  const chart = page.getByTestId('commit-activity-chart');

  // Week is the default: all three commits are inside it.
  await expect(chart).toHaveAttribute('aria-label', 'Commit activity, last 7 days: 3 commits');

  await page.getByRole('radio', { name: 'Last 30 days' }).click();
  await expect(chart).toHaveAttribute('aria-label', 'Commit activity, last 30 days: 3 commits');

  await page.getByRole('radio', { name: 'Last 24 hours' }).click();
  await expect(chart).toHaveAttribute('aria-label', 'Commit activity, last 24 hours: 1 commit');
});

test('the style icons swap the drawing, and the choice reaches Settings', async ({ page }) => {
  await open(page);
  await page.getByTestId('activity-toggle').click();
  const chart = page.getByTestId('commit-activity-chart');

  await expect(chart).toHaveAttribute('data-variant', 'bars');
  await page.getByRole('radio', { name: 'Heatmap' }).click();
  await expect(chart).toHaveAttribute('data-variant', 'heatmap');
  await page.getByRole('radio', { name: 'Sparkline' }).click();
  await expect(chart).toHaveAttribute('data-variant', 'sparkline');

  // Same store field the Settings page edits — the panel's icons are the
  // second door onto it, so the first door has to agree.
  await expect(page.getByRole('radio', { name: 'Sparkline' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('the gridlines toggle draws the timeframe cadence it names', async ({ page }) => {
  await open(page);
  await page.getByTestId('activity-toggle').click();
  const toggle = page.getByTestId('activity-gridlines-toggle');

  // Off by default, and the label says what turning it on will draw.
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveAttribute('aria-label', 'Show gridlines (every day)');
  await expect(page.getByTestId('activity-gridlines')).toHaveCount(0);

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // A week rules every day boundary but the first, plus the churn baseline.
  await expect(page.getByTestId('activity-gridlines').locator('line')).toHaveCount(7);

  // The cadence follows the window: 30 days rules every week instead.
  await page.getByRole('radio', { name: 'Last 30 days' }).click();
  await expect(toggle).toHaveAttribute('aria-label', 'Hide gridlines (every week)');
  await expect(page.getByTestId('activity-gridlines').locator('line')).toHaveCount(5);
});

test('hovering a bucket names it, its commits and its churn', async ({ page }) => {
  await open(page);
  await page.getByTestId('activity-toggle').click();

  // The last hit rect is the newest bucket — the one holding the +12/-3 commit
  // from an hour ago. Vertical panel, so "last" is the bottom one.
  await page.getByTestId('activity-hit').last().hover();

  const tip = page.getByTestId('activity-tooltip');
  await expect(tip).toBeVisible();
  await expect(tip).toContainText('1 commit');
  await expect(tip).toContainText('+12');
  await expect(tip).toContainText('−3');
  await expect(tip).toContainText('of the last 7 days');

  // Leaving the chart takes it away rather than parking it over the content.
  await page.getByTestId('status-bar').hover();
  await expect(tip).toHaveCount(0);
});

test('a repository with no rows says so instead of drawing an empty chart', async ({ page }) => {
  await open(page, { ...fixtures });
  await page.getByTestId('activity-toggle').click();
  await expect(page.getByTestId('commit-activity-panel')).toContainText('No commits');
  await expect(page.getByTestId('commit-activity-chart')).toHaveCount(0);
});
