import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * The History view (Phase 22 Themes G + H) — the nav-rail item and its two
 * tabs.
 *
 * Phase 82 Theme C wave 5 moved every other test here to
 * `src/features/history/history-view.bridge.test.tsx`, mounting
 * `HistoryView` directly: the Reflog tab's newest-first old→new sha
 * rendering, the ref selector's refetch, the action filter's client-side
 * narrowing, and the Checkout button's real op call. One smoke test stays
 * here, proving the rail actually reaches this view through a real page
 * load — the jsdom suite mounts `HistoryView` directly and never exercises
 * the rail link or its keyboard-activation workaround (see this file's own
 * history for why a plain `.click()` on the rail link was unreliable here).
 */

async function open(page: import('@playwright/test').Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
}

/**
 * Keyboard activation, not `.click()`.
 *
 * A real, trusted mouse click on this rail's own `<a>` items is unreliable in
 * this checkout today for reasons unrelated to this feature — the SAME
 * flakiness reproduces on `Changes`, an existing view this pass did not
 * touch, while `Enter` on the focused link and a dispatched `click` event
 * both work every time.
 */
async function goToHistory(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('link', { name: 'History' }).focus();
  await page.keyboard.press('Enter');
}

test('the History view renders both tabs, Journal first, with its empty state', async ({ page }) => {
  await open(page);

  await goToHistory(page);

  const tablist = page.getByRole('tablist', { name: 'History' });
  await expect(tablist.getByRole('tab', { name: 'Journal' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tablist.getByRole('tab', { name: 'Reflog' })).toBeVisible();

  await expect(
    page.getByText('Nothing recorded yet — every write this app makes to this repository will show up here.'),
  ).toBeVisible();
});
