import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The commit-activity timeline as a panel in the running app.
 *
 * The unit tests own the arithmetic — bucketing, the three drawings, the axis
 * swap. What only the running app can show is the wiring: that the status-bar
 * toggle actually raises the panel, that the chord reaches it, that the D/W/M
 * picker moves the window the chart announces, and that a repository with no
 * timeline rows says "No commits" rather than drawing an empty chart.
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

test('a repository with no rows says so instead of drawing an empty chart', async ({ page }) => {
  await open(page, { ...fixtures });
  await page.getByTestId('activity-toggle').click();
  await expect(page.getByTestId('commit-activity-panel')).toContainText('No commits');
  await expect(page.getByTestId('commit-activity-chart')).toHaveCount(0);
});
