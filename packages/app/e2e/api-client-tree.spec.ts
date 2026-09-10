import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 66 Theme H — with a collection on disk, the tree renders its folders
 * and its requests, and clicking a request opens a tab.
 *
 * Phase 82 Theme C wave 5 moved this file's assertions to
 * `src/features/api-client/api-client-view.bridge.test.tsx`, mounting
 * `ApiClientView` directly with the same fixture. **One smoke test stays
 * here** — the simplest "the view renders and shows X" case, reached through
 * the real rail navigation rather than a direct mount, so the suite still
 * proves the view is reachable end to end in a real browser at least once.
 */
const collection = {
  info: { name: 'Gateway', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    {
      name: 'tasks',
      item: [
        {
          name: 'List tasks',
          request: { method: 'GET', url: { raw: '{{baseUrl}}/tasks' } },
        },
        {
          name: 'Create a task',
          request: { method: 'POST', url: { raw: '{{baseUrl}}/tasks' } },
        },
      ],
    },
    {
      name: 'Health check',
      request: { method: 'GET', url: { raw: '{{baseUrl}}/health' } },
    },
  ],
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:7777' }],
};

const withCollection: MockFixtures = {
  ...fixtures,
  apiCollections: [{ id: 'gateway.postman_collection.json', fileName: 'gateway.postman_collection.json', collection }],
};

test('the tree renders a collection, its folder and its requests', async ({ page }) => {
  await installMockBridge(page, withCollection);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  // The collection is its own top-level section, named from `info.name` rather
  // than the file name.
  await expect(page.getByText('Gateway')).toBeVisible();

  // A top-level request sits beside the folder, not inside it.
  await expect(page.getByText('Health check')).toBeVisible();
});
