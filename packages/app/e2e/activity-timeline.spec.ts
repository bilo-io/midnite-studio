import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The commit-activity timeline as a panel in the running app.
 *
 * The unit tests own the arithmetic — bucketing, gridline cadence, the three
 * drawings, the axis swap. What only the running app can show is the wiring:
 * that the status-bar toggle actually raises the panel, that the chord reaches
 * it, that each header control moves the store field Settings shares with it
 * (D/W/M/Y, the style icons, the gridline switch), that hovering a bucket raises
 * the tooltip and leaving the chart takes it away, and that a repository with
 * no timeline rows says "No commits" rather than drawing an empty chart.
 *
 * Phase 82 Theme C wave 5 moved 7 of this file's original 9 tests to
 * `src/features/activity/commit-activity-panel.bridge.test.tsx`, mounting
 * `CommitActivityPanel` directly with `activityTimelineOpen` already set. The
 * 2 left here are both about *reaching* the panel rather than anything inside
 * it: the status-bar toggle raising it, and the global chord doing the same.
 */

const DAY_S = 86_400;
const nowS = Math.floor(Date.now() / 1000);

/**
 * Relative to the clock, because the panel buckets against `Date.now()`.
 *
 * The newest row is `nowS` itself, not an hour ago: the hover test asserts on
 * the *last* bucket's contents, and "an hour ago" falls into the previous hour
 * bucket in the day view and into yesterday's in the week view whenever the
 * suite runs in the first hour after local midnight.
 */
const TIMELINE = [
  { sha: 'a'.repeat(40), at: nowS, additions: 12, deletions: 3 },
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
