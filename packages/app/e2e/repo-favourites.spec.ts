import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

const panel = (page: Page) => page.getByRole('complementary', { name: 'Repositories' });
const REPO = 'midnite-studio';

test.describe('repo favourites', () => {
  test('adds repo to favourites, shows Favourites section at top, and removes from favourites', async ({
    page,
  }) => {
    await installMockBridge(page, fixtures);
    await page.goto('/');

    // Initially, no Favourites section is present
    await expect(panel(page).getByTestId('repo-favourites-section')).not.toBeVisible();

    if (process.env.MSTUDIO_SHOTS) {
      await panel(page).screenshot({ path: '../../docs/screenshots/adhoc-repo-favourites-before.png' });
    }

    // Open repo lifecycle actions menu (the ellipsis button)
    const lifecycleBtn = panel(page).getByRole('button', {
      name: `Set up, install, build, test or launch ${REPO}`,
    });
    await lifecycleBtn.click();

    // Verify "Add to Favourites" is visible and click it
    const addFavItem = page.getByRole('menuitem', { name: 'Add to Favourites' });
    await expect(addFavItem).toBeVisible();
    await addFavItem.click();

    // Favourites section is now visible at the top
    const favSection = panel(page).getByTestId('repo-favourites-section');
    await expect(favSection).toBeVisible();
    await expect(favSection.getByText('Favourites')).toBeVisible();

    // The favourite repo item is rendered inside the favourites section
    await expect(favSection.getByRole('button', { name: REPO, exact: true })).toBeVisible();

    if (process.env.MSTUDIO_SHOTS) {
      await panel(page).screenshot({ path: '../../docs/screenshots/adhoc-repo-favourites-after.png' });
    }

    // Open the ellipsis menu on the favourite repo inside the favourites section
    const favLifecycleBtn = favSection.getByRole('button', {
      name: `Set up, install, build, test or launch ${REPO}`,
    });
    await favLifecycleBtn.click();

    // Option should now say "Remove from Favourites"
    const removeFavItem = page.getByRole('menuitem', { name: 'Remove from Favourites' });
    await expect(removeFavItem).toBeVisible();
    await removeFavItem.click();

    // Favourites section disappears when there are no favourites left
    await expect(favSection).not.toBeVisible();
  });

  test('context menu on repo also offers Add to Favourites / Remove from Favourites', async ({
    page,
  }) => {
    await installMockBridge(page, fixtures);
    await page.goto('/');

    const repoBtn = panel(page).getByRole('button', { name: REPO, exact: true });
    await repoBtn.click({ button: 'right' });

    const addFavItem = page.getByRole('menuitem', { name: 'Add to Favourites' });
    await expect(addFavItem).toBeVisible();
    await addFavItem.click();

    const favSection = panel(page).getByTestId('repo-favourites-section');
    await expect(favSection).toBeVisible();

    // Right click the repo inside the favourites section
    const favRepoBtn = favSection.getByRole('button', { name: REPO, exact: true });
    await favRepoBtn.click({ button: 'right' });
    const removeFavItem = page.getByRole('menuitem', { name: 'Remove from Favourites' });
    await expect(removeFavItem).toBeVisible();
    await removeFavItem.click();

    await expect(favSection).not.toBeVisible();
  });
});
