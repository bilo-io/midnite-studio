import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 66 Theme H — with a collection on disk, the tree renders its folders
 * and its requests, and clicking a request opens a tab.
 *
 * The fixture is a real Postman v2.1 document, nested one folder deep, because
 * the tree recurses through `renderItems(items, depth)` and a flat fixture
 * would exercise none of that. `itemPath` — the folder-name path, not an index
 * (Theme C) — is what a tab is keyed by, so a nested request is the case that
 * proves addressing works.
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

test('clicking a request opens a tab for it', async ({ page }) => {
  await installMockBridge(page, withCollection);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  // Before anything is opened the right pane shows its empty copy.
  await expect(page.getByText('Open a request from the tree to build and send it.')).toBeVisible();

  // A collection renders expanded, so its top-level request is directly
  // clickable. Deliberately the top-level one rather than a nested one: this
  // asserts that a request row *opens a tab*, and threading it through two
  // disclosure toggles first would make a failure ambiguous between "the row
  // does not open a tab" and "the folder did not expand".
  await expect(page.getByText('Health check', { exact: true })).toBeVisible();
  await page.getByText('Health check', { exact: true }).click();

  // The empty copy is gone, which is the load-bearing assertion: the tab
  // opened and the builder mounted in its place.
  await expect(
    page.getByText('Open a request from the tree to build and send it.'),
  ).toBeHidden();
});
