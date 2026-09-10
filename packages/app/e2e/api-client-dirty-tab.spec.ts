import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 66 Theme H — editing a request marks its tab dirty, and closing a
 * dirty tab prompts before discarding.
 *
 * Phase 82 Theme C wave 5 moved this file's assertions to
 * `src/features/api-client/request-tab-strip.bridge.test.tsx`, mounting
 * `ApiClientView` directly with the same fixture. **One smoke test stays
 * here** — the simplest of the two, reached through the real rail navigation
 * rather than a direct mount, so the suite still proves the tab strip's
 * close behaviour end to end in a real browser at least once.
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
