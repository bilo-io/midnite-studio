import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * Phase 27 Theme F: the browser pane the keymap has promised since Phase 9.
 *
 * A chrome stub with no engine, whose whole point is what it proves rather
 * than what it does: it covers the repositories panel and the view, and the
 * status bar stays visible AND hit-testable beneath it — which is only
 * possible once Theme A made the bar span the full content area.
 */
test('the toggle opens the pane over the repositories panel, and the bar stays hit-testable beneath it', async ({
  page,
}) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  const reposAside = page.getByRole('complementary', { name: 'Repositories' });
  await expect(reposAside).toBeVisible();

  await page.locator('[title^="Toggle browser"]').click();

  const pane = page.getByRole('textbox', { name: 'Address' });
  await expect(pane).toBeVisible();
  // Covers the repositories panel — it is still in the DOM (unmounting it
  // would cost a re-fetch of its per-repo status) but painted under the pane.
  await expect(reposAside).toBeVisible();

  const statusBar = page.getByTestId('status-bar');
  await expect(statusBar).toBeVisible();
  // Hit-testable, not merely uncovered: click a bar control while the pane is
  // open and assert it acted, rather than asserting visibility alone.
  const terminalToggle = page.locator('[title^="Toggle terminal"]');
  await terminalToggle.click();
  await expect(page.getByRole('button', { name: 'Expand terminal' })).toBeVisible();
});

test('Escape closes the pane, and it reopens with the same state on reload', async ({ page }) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await page.locator('[title^="Toggle browser"]').click();
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('textbox', { name: 'Address' })).toHaveCount(0);

  await page.locator('[title^="Toggle browser"]').click();
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Address' })).toBeVisible();
});

test('the URL field is inert: Enter neither navigates nor clears the field, and the plate says so', async ({
  page,
}) => {
  await installMockBridge(page, { ...fixtures });
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();

  await page.locator('[title^="Toggle browser"]').click();
  await expect(page.getByText('No web engine yet.')).toBeVisible();

  const address = page.getByRole('textbox', { name: 'Address' });
  await address.fill('example.com');
  await address.press('Enter');

  await expect(address).toHaveValue('example.com');
  await expect(page.getByText('No web engine yet — example.com would load here.')).toBeVisible();
});
