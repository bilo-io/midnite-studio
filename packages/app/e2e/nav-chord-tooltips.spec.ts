import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The rail teaches its own chords.
 *
 * The unit tests own the map (`nav-chords.test.ts`); what only the assembled
 * app can show is that the bubble reaches the DOM on hover, carries the chord
 * and NOT a second copy of the label the expanded row is already showing, and
 * stays away entirely from the rows that have no chord.
 *
 * Chords are asserted as `⌘⇧G|Ctrl+Shift+G` because `displayChord` renders the
 * modifier the running platform actually has — the suite runs on macOS locally
 * and Linux in CI, and a bare `⌘⇧G` would pass in exactly one of them.
 *
 * `⌘⇧`, not macOS's own `⇧⌘`: `displayChord` substitutes `Mod+` before `Shift+`,
 * so that is what every chord hint in the app has always read. Fixing the order
 * is a change to that helper and to every surface at once, not to this suite.
 */

async function open(page: Page): Promise<void> {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByTestId('status-bar')).toBeVisible();
}

/**
 * Hover a rail row and wait out its reflow before reading the tooltip.
 *
 * The rail is a strip of icons until hovered, so the first `hover()` lands on
 * the collapsed icon and immediately starts the expand — which moves the row
 * out from under the pointer, and a pointer that has left cancels the bubble
 * before its 400ms open delay elapses. Waiting for the row's own label (the
 * expansion's observable end state) and hovering again is the same fix
 * `clickRailLink` makes for clicks.
 */
async function hoverRailRow(page: Page, name: string) {
  const link = page.getByRole('link', { name, exact: true });
  await link.hover();
  await expect(link.getByText(name, { exact: true })).toBeVisible();
  await link.hover();
  return link;
}

test.describe('nav rail chord tooltips', () => {
  test('shows the chord — and only the chord — for a row that has one', async ({ page }) => {
    await open(page);

    await hoverRailRow(page, 'Graph');
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(/^(⌘⇧G|Ctrl\+Shift\+G)$/);
    // The expanded row says "Graph" perfectly well; a bubble repeating it is
    // the thing this deliberately does not do.
    await expect(tip).not.toContainText('Graph');
  });

  test('gives Explorer, Search and Changes their own chords', async ({ page }) => {
    await open(page);

    for (const [name, chord] of [
      ['Explorer', /^(⌘⇧E|Ctrl\+Shift\+E)$/],
      ['Search', /^(⌘⇧F|Ctrl\+Shift\+F)$/],
      ['Changes', /^(⌘2|Ctrl\+2)$/],
    ] as const) {
      await hoverRailRow(page, name);
      await expect(page.getByRole('tooltip')).toHaveText(chord);
      // Off the rail entirely, so the next row's bubble is unambiguously its
      // own rather than the previous one still fading.
      await page.mouse.move(600, 400);
      await expect(page.getByRole('tooltip')).toHaveCount(0);
    }
  });

  test('leaves a chord-free row with no bubble at all', async ({ page }) => {
    await open(page);

    await hoverRailRow(page, 'Dashboard');
    // Long enough to clear the tooltip's own open delay — an assertion that
    // resolved instantly would pass before a bubble could have appeared.
    await page.waitForTimeout(700);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('gives the footer’s lock button its chord too', async ({ page }) => {
    await open(page);

    const lock = page.getByRole('button', { name: 'Lock screen', exact: true });
    await lock.hover();
    const tip = page.getByRole('tooltip');
    await expect(tip).toBeVisible();
    /*
      Chord-only, like the rows above it: entering the rail anywhere — the
      footer included — expands it, so the pointer is never over this button
      while its label is hidden. `RailLockButton` still prefixes the name for
      the `collapsed` nav mode, which the pin cannot reach but a persisted
      preference can; that branch has no hover state to test from here.
    */
    await expect(tip).toHaveText(/^(⌘⇧L|Ctrl\+Shift\+L)$/);
  });
});
