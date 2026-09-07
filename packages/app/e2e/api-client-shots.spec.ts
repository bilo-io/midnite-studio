import { test, type Page } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  settle,
  setTheme,
  shotPath,
  type MockFixtures,
} from './shots-helper';

/**
 * The committed screenshots for Phase 66 — Theme H's own screenshot item,
 * which names five states in light and dark: the empty state, the tree with a
 * collection expanded, the request builder on the Body/JSON tab, the response
 * viewer on a JSON body, and the truncated banner.
 *
 * Uses the shared `shots-helper.ts` harness (Phase 56 Theme G) rather than a
 * bespoke bridge install, and the `apiClient` mock namespace this same theme
 * added — without which none of this is photographable, because the renderer
 * awaits `listCollections` on first render.
 *
 * The truncated banner needs its own `apiResponse` fixture rather than a real
 * oversized body: the cap lives in main (`send.ts`'s `readCapped`), so under a
 * mocked bridge the only way to reach that state is to answer with
 * `truncated: true` directly. That is the honest way round — the *behaviour*
 * is covered by `send.test.ts`, which asserts the server saw the socket close
 * early; this is only the banner it produces.
 */
const OUT = '../../docs/screenshots/p66-api-client';

const COLLECTION = {
  info: {
    name: 'Gateway',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    {
      name: 'tasks',
      item: [
        { name: 'List tasks', request: { method: 'GET', url: { raw: '{{baseUrl}}/tasks' } } },
        { name: 'Create a task', request: { method: 'POST', url: { raw: '{{baseUrl}}/tasks' } } },
      ],
    },
    { name: 'Health check', request: { method: 'GET', url: { raw: '{{baseUrl}}/health' } } },
  ],
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:7777' }],
};

const WITH_COLLECTION: MockFixtures = {
  ...fixtures,
  apiCollections: [
    {
      id: 'gateway.postman_collection.json',
      fileName: 'gateway.postman_collection.json',
      collection: COLLECTION,
    },
  ],
};

const JSON_RESPONSE = {
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(
    { tasks: [{ id: 't1', title: 'Ship the API client', status: 'in-progress' }], total: 1 },
    null,
    2,
  ),
  bodyIsJson: true,
  durationMs: 42,
  sizeBytes: 118,
  truncated: false,
  warnings: [],
};

const TRUNCATED_RESPONSE = { ...JSON_RESPONSE, sizeBytes: 5_242_880, truncated: true };

async function openApiClient(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await clickRailLink(page, 'API Client');
  await page.getByRole('heading', { name: 'API Client', level: 2 }).waitFor();
}

/** Open the collection's top-level request, so the builder is on screen. */
async function openRequest(page: Page): Promise<void> {
  await page.getByText('Health check', { exact: true }).click();
  await page.getByLabel('URL').waitFor();
}

test.describe('Phase 66 — API Client screenshots', () => {
  test('the empty state, light', async ({ page }) => {
    await openApiClient(page, { ...fixtures });
    await page.getByText('Open a request from the tree to build and send it.').waitFor();
    await page.screenshot({ path: shotPath(OUT, 'api-client-empty-light.png') });
  });

  test('the empty state, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, { ...fixtures });
    await page.getByText('Open a request from the tree to build and send it.').waitFor();
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT, 'api-client-empty-dark.png') });
  });

  test('the tree with a collection, light', async ({ page }) => {
    await openApiClient(page, WITH_COLLECTION);
    await page.getByText('Health check', { exact: true }).waitFor();
    await page.screenshot({ path: shotPath(OUT, 'api-client-tree-light.png') });
  });

  test('the tree with a collection, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, WITH_COLLECTION);
    await page.getByText('Health check', { exact: true }).waitFor();
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT, 'api-client-tree-dark.png') });
  });

  test('the request builder, light', async ({ page }) => {
    await openApiClient(page, WITH_COLLECTION);
    await openRequest(page);
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, 'api-client-builder-light.png') });
  });

  test('the request builder, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, WITH_COLLECTION);
    await openRequest(page);
    await setTheme(page, 'dark', { settleMs: 400 });
    await page.screenshot({ path: shotPath(OUT, 'api-client-builder-dark.png') });
  });

  test('a JSON response, light', async ({ page }) => {
    await openApiClient(page, { ...WITH_COLLECTION, apiResponse: JSON_RESPONSE });
    await openRequest(page);
    await page.getByRole('button', { name: 'Send' }).click();
    await settle(page, 500);
    await page.screenshot({ path: shotPath(OUT, 'api-client-response-json-light.png') });
  });

  test('a JSON response, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, { ...WITH_COLLECTION, apiResponse: JSON_RESPONSE });
    await openRequest(page);
    await page.getByRole('button', { name: 'Send' }).click();
    await setTheme(page, 'dark', { settleMs: 500 });
    await page.screenshot({ path: shotPath(OUT, 'api-client-response-json-dark.png') });
  });

  test('the truncated banner, light', async ({ page }) => {
    await openApiClient(page, { ...WITH_COLLECTION, apiResponse: TRUNCATED_RESPONSE });
    await openRequest(page);
    await page.getByRole('button', { name: 'Send' }).click();
    await settle(page, 500);
    await page.screenshot({ path: shotPath(OUT, 'api-client-truncated-light.png') });
  });

  test('the truncated banner, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, { ...WITH_COLLECTION, apiResponse: TRUNCATED_RESPONSE });
    await openRequest(page);
    await page.getByRole('button', { name: 'Send' }).click();
    await setTheme(page, 'dark', { settleMs: 500 });
    await page.screenshot({ path: shotPath(OUT, 'api-client-truncated-dark.png') });
  });
});
