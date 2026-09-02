import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The History view (Phase 22 Theme H) — the nav-rail item and its two tabs.
 *
 * This is deliberately a shell-level check, not a full write-then-undo
 * round trip: Theme B (the sidebar's stash UI, the only current renderer
 * trigger for a real `stash-drop`) has not landed in this checkout, and
 * Theme G (the reflog reader) has not either, despite the phase doc marking
 * both done — see the phase doc's own correction commit for Theme H's
 * identical prior claim. The recording, classification and undo-execution
 * logic this spec would otherwise be exercising through the UI is covered
 * directly under vitest instead: `shared/src/domain/journal.test.ts` (the
 * classifier), `services/use-status.test.tsx` (journal recording on every
 * successful op), and `services/use-journal.test.tsx` +
 * `features/stash/use-stash-actions.test.tsx` (the two wired undo actions).
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
 * both work every time. See this file's own header note and the report for
 * the investigation; this is the honest, reliable way to drive the rail
 * until whatever the other in-progress e2e work in this checkout is fixing
 * that lands.
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

test('switching to the Reflog tab shows its honest placeholder, not invented data', async ({
  page,
}) => {
  await open(page);

  await goToHistory(page);
  await page.getByRole('tab', { name: 'Reflog' }).click();

  await expect(page.getByRole('tab', { name: 'Reflog' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/Reflog browsing lands with Phase 22 Theme G/)).toBeVisible();
});
