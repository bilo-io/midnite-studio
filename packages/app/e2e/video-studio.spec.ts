import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Video Studio (Phase 44), assembled.
 *
 * Phase 82 Theme C wave 5 moved the rest of this file's tests to
 * `src/features/media/video/video-tab.bridge.test.tsx`, mounting `VideoTab`
 * directly. All 5 of the original tests ported cleanly — none needed real
 * browser behavior — so **this one smoke test is kept behind on its own**,
 * per the migration's own rule to leave at least one representative test per
 * e2e file: it is the cheapest proof that the rail link, the lazy view
 * registry and the assembled `VideoTab` still compose in a real browser,
 * which mounting the component directly bypasses entirely.
 */

async function open(page: import('@playwright/test').Page, data: MockFixtures = fixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await expect(async () => {
    // Phase 99 Theme A: Video Studio is Media's Video tab now.
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Video' }).click();
    await expect(page.getByRole('heading', { name: 'Video' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test('no projects yet shows the empty state', async ({ page }) => {
  await open(page);
  await expect(page.getByText('No projects yet')).toBeVisible();
  await expect(page.getByText('Select a project')).toBeVisible();
});
