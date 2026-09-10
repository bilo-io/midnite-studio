import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * One sync button, and what happens when the sync does not go cleanly.
 *
 * Phase 82 Theme C wave 5 moved the button's own behaviour — label/counts,
 * fetch→pull→push ordering, publishing an unpublished branch, the conflict
 * dialog, handing a repair to Claude, and the rebase offer on a rejected
 * push — to `src/features/status/sync-controls.bridge.test.tsx`, mounting
 * `SyncControls` directly. The one test left here is not about the sync
 * button at all: it is a whole-rail assertion that needs the app's outer
 * nav shell, which mounting `SyncControls` alone bypasses entirely.
 */
const base: MockFixtures = { ...fixtures, statusEntries: [] };

const open = async (page: Page, data: MockFixtures = base): Promise<void> => {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Graph' })).toBeVisible();
};

test('the rail names the file browser Explorer, not Files or Folder', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('link', { name: 'Explorer' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Files' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Folder' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Changes' })).toBeVisible();
});
