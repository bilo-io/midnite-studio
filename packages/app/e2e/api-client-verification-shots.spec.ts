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
 * The committed screenshots for Phase 70 Theme E's own list: the environment
 * editor with a masked row, the Scripts tab, the test-results panel with a
 * mixed pass/fail, the runner summary, and the history section — five
 * states, light and dark, via the shared `shots-helper.ts` harness (not a
 * bespoke bridge install), same as `api-client-shots.spec.ts` (Phase 66
 * Theme H) did for the request builder itself.
 *
 * The environment popover is opened with keyboard activation
 * (`focus()` + `Enter`), not a plain `.click()` — see
 * `api-client-environments.spec.ts`'s own header for the real bug a mouse
 * click on that specific trigger runs into (`Popover`'s scroll-dismiss
 * listener closing the panel it just opened).
 */
const OUT = '../../docs/screenshots/p70-e';

const SCRIPTED_COLLECTION = {
  info: { name: 'Widgets', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    {
      name: 'List widgets',
      request: { method: 'GET', url: { raw: '{{baseUrl}}/widgets' } },
      event: [
        {
          listen: 'prerequest',
          script: { exec: ["pm.environment.set('requestedAt', String(Date.now()));"] },
        },
        {
          listen: 'test',
          script: {
            exec: [
              "pm.test('status is 200', () => pm.expect(pm.response).to.have.status(200));",
              "pm.test('has an id', () => pm.expect(pm.response.json()).to.have.property('id'));",
            ],
          },
        },
      ],
    },
  ],
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:7777' }],
};

const WITH_SCRIPTED_COLLECTION: MockFixtures = {
  ...fixtures,
  apiCollections: [
    { id: 'widgets.postman_collection.json', fileName: 'widgets.postman_collection.json', collection: SCRIPTED_COLLECTION },
  ],
  apiTrustedCollections: ['widgets.postman_collection.json'],
};

const MIXED_SCRIPT_RUN: MockFixtures['apiScriptRun'] = {
  results: [
    { name: 'status is 200', passed: true },
    { name: 'has an id', passed: false, error: 'expected undefined to equal 1' },
  ],
  logs: ['fetching widgets…'],
  error: null,
};

const RUN_ITEMS: NonNullable<MockFixtures['apiRunItems']> = [
  {
    itemPath: ['List widgets'],
    name: 'List widgets',
    method: 'GET',
    status: 'passed',
    durationMs: 18,
    response: {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: '{"widgets":[]}',
      bodyIsJson: true,
      durationMs: 18,
      sizeBytes: 14,
      truncated: false,
      warnings: [],
    },
    assertions: [{ name: 'status is 200', passed: true }],
    error: null,
  },
  {
    itemPath: ['Create a widget'],
    name: 'Create a widget',
    method: 'POST',
    status: 'failed',
    durationMs: 24,
    response: {
      status: 201,
      statusText: 'Created',
      headers: {},
      body: '{"id":"w1"}',
      bodyIsJson: true,
      durationMs: 24,
      sizeBytes: 11,
      truncated: false,
      warnings: [],
    },
    assertions: [{ name: 'name is echoed back', passed: false, error: "expected undefined to equal 'Gizmo'" }],
    error: null,
  },
  {
    itemPath: ['Delete a widget'],
    name: 'Delete a widget',
    method: 'DELETE',
    status: 'passed',
    durationMs: 9,
    response: {
      status: 204,
      statusText: 'No Content',
      headers: {},
      body: '',
      bodyIsJson: false,
      durationMs: 9,
      sizeBytes: 0,
      truncated: false,
      warnings: [],
    },
    assertions: [],
    error: null,
  },
];

const HISTORY_ENTRIES = [
  {
    id: 'h1',
    at: Date.parse('2026-08-26T11:58:00Z'),
    method: 'GET',
    url: 'http://127.0.0.1:7777/widgets',
    status: 200,
    durationMs: 18,
    sizeBytes: 128,
    collectionId: 'widgets.postman_collection.json',
    itemPath: ['List widgets'],
    environmentId: null,
  },
  {
    id: 'h2',
    at: Date.parse('2026-08-26T11:55:00Z'),
    method: 'POST',
    url: 'http://127.0.0.1:7777/widgets',
    status: 201,
    durationMs: 24,
    sizeBytes: 64,
    collectionId: 'widgets.postman_collection.json',
    itemPath: null,
    environmentId: null,
  },
  {
    id: 'h3',
    at: Date.parse('2026-08-26T11:50:00Z'),
    method: 'GET',
    url: 'http://127.0.0.1:7777/widgets?api_key={{apiKey}}',
    status: 401,
    durationMs: 6,
    sizeBytes: 32,
    collectionId: null,
    itemPath: null,
    environmentId: 'local.postman_environment.json',
  },
];

async function openApiClient(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await clickRailLink(page, 'API Client');
  await page.getByRole('heading', { name: 'API Client', level: 2 }).waitFor();
}

/** Keyboard-activated, per `api-client-environments.spec.ts`'s own note. */
async function openEnvironmentSwitcher(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Select environment' }).focus();
  await page.keyboard.press('Enter');
}

async function openScriptedRequest(page: Page): Promise<void> {
  await page.getByText('List widgets', { exact: true }).click();
  await page.getByRole('button', { name: 'Scripts' }).click();
}

test.describe('Phase 70 Theme E — API Client screenshots', () => {
  test('the environment editor with a masked row, light', async ({ page }) => {
    await openApiClient(page, { ...fixtures });
    await openEnvironmentSwitcher(page);
    await page.getByText('New environment…').click();
    await page.getByLabel('Environment name').fill('Local');
    await page.getByText('Add variable').click();
    await page.getByText('Add variable').click();
    const rows = page.locator('tbody tr');
    await rows.nth(0).getByLabel('Key').fill('baseUrl');
    await rows.nth(0).getByLabel('Value').fill('http://127.0.0.1:7777');
    await rows.nth(1).getByLabel('Key').fill('apiKey');
    await rows.nth(1).getByLabel('Value').fill('sk-super-secret');
    await rows.nth(1).getByRole('button', { name: 'Default' }).click();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT, 'environment-editor-masked-light.png') });
  });

  test('the environment editor with a masked row, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, { ...fixtures });
    await openEnvironmentSwitcher(page);
    await page.getByText('New environment…').click();
    await page.getByLabel('Environment name').fill('Local');
    await page.getByText('Add variable').click();
    await page.getByText('Add variable').click();
    const rows = page.locator('tbody tr');
    await rows.nth(0).getByLabel('Key').fill('baseUrl');
    await rows.nth(0).getByLabel('Value').fill('http://127.0.0.1:7777');
    await rows.nth(1).getByLabel('Key').fill('apiKey');
    await rows.nth(1).getByLabel('Value').fill('sk-super-secret');
    await rows.nth(1).getByRole('button', { name: 'Default' }).click();
    await setTheme(page, 'dark', { settleMs: 300 });
    await page.screenshot({ path: shotPath(OUT, 'environment-editor-masked-dark.png') });
  });

  test('the Scripts tab, light', async ({ page }) => {
    await openApiClient(page, WITH_SCRIPTED_COLLECTION);
    await openScriptedRequest(page);
    await settle(page, 500);
    await page.screenshot({ path: shotPath(OUT, 'scripts-tab-light.png') });
  });

  test('the Scripts tab, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, WITH_SCRIPTED_COLLECTION);
    await openScriptedRequest(page);
    await setTheme(page, 'dark', { settleMs: 500 });
    await page.screenshot({ path: shotPath(OUT, 'scripts-tab-dark.png') });
  });

  test('the test-results panel with a mixed pass/fail, light', async ({ page }) => {
    await openApiClient(page, { ...WITH_SCRIPTED_COLLECTION, apiScriptRun: MIXED_SCRIPT_RUN });
    await openScriptedRequest(page);
    await page.getByRole('button', { name: 'Send' }).click();
    await settle(page, 500);
    await page.screenshot({ path: shotPath(OUT, 'test-results-mixed-light.png') });
  });

  test('the test-results panel with a mixed pass/fail, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, { ...WITH_SCRIPTED_COLLECTION, apiScriptRun: MIXED_SCRIPT_RUN });
    await openScriptedRequest(page);
    await page.getByRole('button', { name: 'Send' }).click();
    await setTheme(page, 'dark', { settleMs: 500 });
    await page.screenshot({ path: shotPath(OUT, 'test-results-mixed-dark.png') });
  });

  test('the runner summary, light', async ({ page }) => {
    await openApiClient(page, {
      ...WITH_SCRIPTED_COLLECTION,
      apiRunItems: RUN_ITEMS,
      apiRunItemDelayMs: 10,
    });
    await page.getByText('List widgets', { exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Run collection…' }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByText('1 failed').waitFor();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'runner-summary-light.png') });
  });

  test('the runner summary, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, {
      ...WITH_SCRIPTED_COLLECTION,
      apiRunItems: RUN_ITEMS,
      apiRunItemDelayMs: 10,
    });
    await page.getByText('List widgets', { exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Run collection…' }).click();
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await page.getByText('1 failed').waitFor();
    await setTheme(page, 'dark', { settleMs: 300 });
    await page.screenshot({ path: shotPath(OUT, 'runner-summary-dark.png') });
  });

  test('the history section, light', async ({ page }) => {
    await openApiClient(page, { ...WITH_SCRIPTED_COLLECTION, apiHistory: HISTORY_ENTRIES });
    await page.getByRole('button', { name: /^History/ }).click();
    await page.getByText('/widgets?api_key={{apiKey}}').waitFor();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT, 'history-section-light.png') });
  });

  test('the history section, dark', async ({ page }) => {
    await setTheme(page, 'dark');
    await openApiClient(page, { ...WITH_SCRIPTED_COLLECTION, apiHistory: HISTORY_ENTRIES });
    await page.getByRole('button', { name: /^History/ }).click();
    await page.getByText('/widgets?api_key={{apiKey}}').waitFor();
    await setTheme(page, 'dark', { settleMs: 300 });
    await page.screenshot({ path: shotPath(OUT, 'history-section-dark.png') });
  });
});
