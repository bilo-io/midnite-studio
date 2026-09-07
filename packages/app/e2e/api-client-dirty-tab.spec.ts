import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 66 Theme H — editing a request marks its tab dirty, and closing a
 * dirty tab prompts before discarding.
 *
 * Dirty is *derived* here, not stored (Theme C): `JSON.stringify(draft) !==
 * JSON.stringify(savedDraft)`, the same way `file-preview.tsx` derives it from
 * `content !== savedContent`. That is what this spec is really covering — a
 * stored boolean would pass a unit test and then go stale on undo, and the
 * only place that shows up is the glyph in the strip.
 *
 * The confirm is the app's existing `ConfirmDialog` with a destructive tone,
 * not a bespoke one, so the copy asserted here is `request-tab-strip.tsx`'s
 * verbatim: `Discard unsaved changes to "<name>"?` with a `Discard` action.
 */
const collection = {
  info: {
    name: 'Gateway',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    {
      name: 'Health check',
      request: { method: 'GET', url: { raw: '{{baseUrl}}/health' } },
    },
  ],
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:7777' }],
};

const withCollection: MockFixtures = {
  ...fixtures,
  apiCollections: [
    {
      id: 'gateway.postman_collection.json',
      fileName: 'gateway.postman_collection.json',
      collection,
    },
  ],
};

test('editing the URL marks the tab dirty and closing it prompts to discard', async ({ page }) => {
  await installMockBridge(page, withCollection);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await page.getByText('Health check', { exact: true }).click();

  // A freshly-opened tab is clean: no dirty glyph.
  const dirtyGlyph = page.getByTitle('Unsaved changes');
  await expect(dirtyGlyph).toBeHidden();

  // Edit the URL. `editDraft` diverges `draft` from `savedDraft`, and the
  // glyph follows from that derivation rather than from any flag being set.
  const url = page.getByLabel('URL');
  await expect(url).toBeVisible();
  await url.fill('http://127.0.0.1:7777/health?verbose=1');
  await expect(dirtyGlyph).toBeVisible();

  // Closing a dirty tab must not discard silently.
  await page.getByLabel('Close Health check').click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText('Discard unsaved changes to "Health check"?')).toBeVisible();

  // Confirming discards: the tab goes, and the pane returns to its empty copy.
  await confirm.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('Open a request from the tree to build and send it.')).toBeVisible();
});

test('closing a clean tab closes it without prompting', async ({ page }) => {
  await installMockBridge(page, withCollection);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await page.getByText('Health check', { exact: true }).click();
  await expect(page.getByLabel('URL')).toBeVisible();

  // No edit, so no prompt — a confirm on every close would train the user to
  // dismiss it, which is how the dirty one stops being read.
  await page.getByLabel('Close Health check').click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByText('Open a request from the tree to build and send it.')).toBeVisible();
});
