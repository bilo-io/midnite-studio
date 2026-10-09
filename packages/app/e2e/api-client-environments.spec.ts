import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 70 Theme A — the environment editor's own masked row and the
 * blast-radius confirm before the first secret this app writes for a repo,
 * plus the switcher reflecting a newly-created environment as the active
 * one.
 *
 * Phase 82 Theme C wave 5 moved this file's assertions to
 * `src/features/api-client/api-client-environments.bridge.test.tsx`,
 * mounting `ApiClientView` directly with the same fixtures. **One smoke
 * test stays here** — the simplest "the view renders and the switcher
 * works" case, reached through real rail navigation, so the suite still
 * proves the environment switcher end to end in a real browser at least
 * once.
 *
 * The e2e original documents a real, narrow bug in shared infrastructure —
 * a plain mouse `.click()` on "Select environment" closes the popover
 * within the same tick, because of a `Popover` × `@bilo-io/shell` nav-rail
 * scroll interaction — and works around it with keyboard activation
 * (`focus()` + `Enter`), which this smoke test keeps: unlike the jsdom
 * port (where no such scroll fires and a plain click is fine), the bug is
 * real here.
 */
async function openEnvironmentSwitcher(page: Page, revealed: Locator): Promise<void> {
  // `Popover` dismisses on ANY capture-phase scroll in the app, and the rail
  // scrolls its active link into view some time after navigation. When that
  // scroll lands after the popover opened (observed on main CI run 37133242957,
  // all three retries), the popover is gone and a single open never recovers.
  // So the open is retried until the item it exists to reveal is on screen.
  await expect(async () => {
    const trigger = page.getByRole('button', { name: 'Select environment' });
    if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
      await trigger.focus();
      await page.keyboard.press('Enter');
    }
    await expect(revealed).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15000 });
}

const collection = {
  info: { name: 'Gateway', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [{ name: 'Health check', request: { method: 'GET', url: { raw: '{{baseUrl}}/health' } } }],
};

const withCollection: MockFixtures = {
  ...fixtures,
  apiCollections: [{ id: 'gateway.postman_collection.json', fileName: 'gateway.postman_collection.json', collection }],
};

test('an environment with no secret rows never needs the confirm, and switching it updates the switcher', async ({ page }) => {
  await installMockBridge(page, {
    ...withCollection,
    apiEnvironments: [
      {
        id: 'prod.postman_environment.json',
        fileName: 'prod.postman_environment.json',
        environment: { id: 'env-prod', name: 'Prod', values: [{ key: 'baseUrl', value: 'https://api.prod.example.com', type: 'default', enabled: true }] },
      },
    ],
  });
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  const switcher = page.getByRole('button', { name: 'Select environment' });
  await expect(switcher).toContainText('No environment');

  await openEnvironmentSwitcher(page, page.getByText('Prod', { exact: true }));
  await page.getByText('Prod', { exact: true }).click();
  await expect(switcher).toContainText('Prod');

  // Editing it back to empty and saving needs no confirm at all.
  await openEnvironmentSwitcher(page, page.getByLabel('Edit Prod'));
  await page.getByLabel('Edit Prod').click();
  const dialog = page.getByRole('dialog', { name: 'Edit environment "Prod"' });
  await dialog.getByRole('button', { name: 'Remove row' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Write secret values to this repository?' })).toBeHidden();
});
