import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Repositories' });

test('repo group header renders collapse/expand all and fetch all buttons', async ({ page }) => {
  await installMockBridge(page, fixtures);
  await page.goto('/');

  // Create a group
  await panel(page).getByRole('button', { name: 'New repo group' }).click();
  const dialog = page.getByRole('dialog', { name: 'New repo group' });
  await dialog.getByLabel('Group name').fill('Work Group');
  await dialog.getByRole('button', { name: 'Create' }).click();

  const groupToggle = panel(page).getByRole('button', { name: /^Work Group \d+$/ });
  await expect(groupToggle).toBeVisible();

  // The collapse/expand all and fetch buttons are present in the group header
  const collapseAllBtn = panel(page).getByRole('button', {
    name: 'Collapse all repositories in Work Group',
  });
  const fetchAllBtn = panel(page).getByRole('button', {
    name: 'Fetch all repositories in Work Group',
  });

  await expect(collapseAllBtn).toBeVisible();
  await expect(fetchAllBtn).toBeVisible();
});
