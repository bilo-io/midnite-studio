import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 70 Theme A — the environment editor's own masked row and the
 * blast-radius confirm before the first secret this app writes for a repo,
 * plus the switcher reflecting a newly-created environment as the active one.
 *
 * The filesystem half of Theme A — "the committed base file never contains a
 * secret value" — is proven by `environment-io.test.ts`'s own raw-bytes
 * assertion (`save with two secret rows writes neither value into the base
 * file`), not here: a mocked bridge has no real file to read, so a Playwright
 * spec asserting "the file on disk" would either fake the read or assert
 * nothing real. What a spec over a mocked bridge CAN prove — and what these
 * two tests do prove — is the UI's own reaction: a secret-typed row masks its
 * value, the confirm gate blocks an unprotected save, and accepting it hands
 * the new environment straight to the switcher.
 */
const collection = {
  info: { name: 'Gateway', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [{ name: 'Health check', request: { method: 'GET', url: { raw: '{{baseUrl}}/health' } } }],
};

const withCollection: MockFixtures = {
  ...fixtures,
  apiCollections: [{ id: 'gateway.postman_collection.json', fileName: 'gateway.postman_collection.json', collection }],
};

test('a secret row masks its value, and saving an unprotected repo needs the blast-radius confirm', async ({ page }) => {
  await installMockBridge(page, withCollection);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await page.getByRole('button', { name: 'Select environment' }).click();
  await page.getByText('New environment…').click();

  const dialog = page.getByRole('dialog', { name: 'New environment' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Environment name').fill('Local');

  // One plain row, one secret row — the phase doc's own wording.
  await dialog.getByText('Add variable').click();
  await dialog.getByText('Add variable').click();

  const rows = dialog.locator('tbody tr');
  await rows.nth(0).getByLabel('Key').fill('baseUrl');
  await rows.nth(0).getByLabel('Value').fill('http://127.0.0.1:7777');

  await rows.nth(1).getByLabel('Key').fill('apiKey');
  await rows.nth(1).getByLabel('Value').fill('sk-super-secret');
  // Toggles the row's type from Default to Secret.
  await rows.nth(1).getByRole('button', { name: 'Default' }).click();

  const secretValue = rows.nth(1).getByLabel('Value');
  await expect(secretValue).toHaveAttribute('type', 'password');

  // Hold-to-reveal: the value is plain text only while the button is held.
  const reveal = rows.nth(1).getByRole('button', { name: 'Hold to reveal' });
  await reveal.dispatchEvent('mousedown');
  await expect(secretValue).toHaveAttribute('type', 'text');
  await reveal.dispatchEvent('mouseup');
  await expect(secretValue).toHaveAttribute('type', 'password');

  // The plain row never masks.
  await expect(rows.nth(0).getByLabel('Value')).toHaveAttribute('type', 'text');

  await dialog.getByRole('button', { name: 'Save' }).click();

  // One secret row in a repo nothing has protected yet — the confirm fires
  // before anything is written (`environment-io.ts`'s own once-per-repo gate,
  // mirrored by the mock's `apiEnvGitignoreProtected` default of `false`).
  const confirm = page.getByRole('dialog', { name: 'Write secret values to this repository?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText('1 secret value will be written to a local, gitignored overlay file, never committed.')).toBeVisible();

  await confirm.getByRole('button', { name: 'Write secrets' }).click();
  await expect(confirm).toBeHidden();
  await expect(dialog).toBeHidden();

  // A brand-new environment becomes the repo's active one immediately.
  await expect(page.getByRole('button', { name: 'Select environment' })).toContainText('Local');
});

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

  await switcher.click();
  await page.getByText('Prod', { exact: true }).click();
  await expect(switcher).toContainText('Prod');

  // Editing it back to empty and saving needs no confirm at all.
  await switcher.click();
  await page.getByLabel('Edit Prod').click();
  const dialog = page.getByRole('dialog', { name: 'Edit environment "Prod"' });
  await dialog.getByRole('button', { name: 'Remove row' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Write secret values to this repository?' })).toBeHidden();
});
