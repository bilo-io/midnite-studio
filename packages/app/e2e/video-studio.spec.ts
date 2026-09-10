import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Video Studio (Phase 44), assembled.
 *
 * Phase 82 Theme C wave 5 moved the rest of this file's tests to
 * `src/features/video/video-view.bridge.test.tsx`, mounting `VideoView`
 * directly. All 5 of the original tests ported cleanly — none needed real
 * browser behavior — so **this one smoke test is kept behind on its own**,
 * per the migration's own rule to leave at least one representative test per
 * e2e file: it is the cheapest proof that the rail link, the lazy view
 * registry and the assembled `VideoView` still compose in a real browser,
 * which mounting the component directly bypasses entirely.
 */

async function open(page: import('@playwright/test').Page, data: MockFixtures = fixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await expect(async () => {
    await clickRailLink(page, 'Video');
    await expect(page.getByRole('heading', { name: 'Video' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test('no projects yet shows the empty state', async ({ page }) => {
  await open(page);
  await expect(page.getByText('No projects yet')).toBeVisible();
  await expect(page.getByText('Select a project')).toBeVisible();
});
