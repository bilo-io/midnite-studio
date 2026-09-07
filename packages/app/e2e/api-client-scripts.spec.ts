import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 70 Themes B and C — the Scripts tab's own rendering of a script's
 * outcome, the consent bar's *Run once* path, and the collection runner's
 * aggregate summary plus a mid-run Stop.
 *
 * None of these specs re-prove the sandbox itself (every pinned `pm.*`
 * method, the five escape attempts, the timeout) — that is
 * `script-runner.test.ts`'s job, under bare vitest, against the real
 * `node:vm` context. A mocked bridge cannot run untrusted JS for real, so
 * `apiClient.runScript`/`runCollection` here answer with a canned
 * `data.apiScriptRun`/`data.apiRunItems` fixture instead of interpreting the
 * script text a spec types in — what these specs prove is the UI's own
 * reaction to each shape of outcome, which the sandbox's own suite cannot.
 */

const scriptedRequest = (name: string) => ({
  name,
  request: { method: 'GET', url: { raw: '{{baseUrl}}/things' } },
  // Non-empty on purpose: `toDraft`'s `scriptFromEvent` is what seeds
  // `draft.testScript`, and `sendRequest`'s own auto-run only fires when that
  // draft field is non-empty — the script's actual text is never read by the
  // mock, only its presence.
  event: [{ listen: 'test', script: { exec: ["pm.test('placeholder', () => pm.expect(1).to.equal(1));"] } } ],
});

test('a passing and a failing assertion both render', async ({ page }) => {
  const collection = {
    info: { name: 'Widgets', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [scriptedRequest('List widgets')],
  };
  const fixture: MockFixtures = {
    ...fixtures,
    apiCollections: [{ id: 'widgets.postman_collection.json', fileName: 'widgets.postman_collection.json', collection }],
    apiTrustedCollections: ['widgets.postman_collection.json'],
    apiScriptRun: {
      results: [
        { name: 'status is 200', passed: true },
        { name: 'has an id', passed: false, error: 'expected undefined to equal 1' },
      ],
      logs: [],
      error: null,
    },
  };
  await installMockBridge(page, fixture);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await page.getByText('List widgets', { exact: true }).click();
  await page.getByRole('button', { name: 'Scripts' }).click();
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('status is 200')).toBeVisible();
  await expect(page.getByText('has an id')).toBeVisible();
  await expect(page.getByText('expected undefined to equal 1')).toBeVisible();

  // Never an error boundary — this is a normal, renderable outcome.
  await expect(page.getByRole('alert')).toBeHidden();
});

test('a script that throws renders as an error row, not an error boundary', async ({ page }) => {
  const collection = {
    info: { name: 'Widgets', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [scriptedRequest('Throws')],
  };
  const fixture: MockFixtures = {
    ...fixtures,
    apiCollections: [{ id: 'widgets.postman_collection.json', fileName: 'widgets.postman_collection.json', collection }],
    apiTrustedCollections: ['widgets.postman_collection.json'],
    apiScriptRun: { results: [], logs: [], error: 'top-level boom' },
  };
  await installMockBridge(page, fixture);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await page.getByText('Throws', { exact: true }).click();
  await page.getByRole('button', { name: 'Scripts' }).click();
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('top-level boom')).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
  // The rest of the shell is still there — nothing above the panel was torn
  // down by an uncaught render error.
  await expect(page.getByRole('button', { name: 'Select environment' })).toBeVisible();
});

test('the consent bar appears for an untrusted collection, Run once runs the script, and a reload asks again', async ({ page }) => {
  const collection = {
    info: { name: 'Widgets', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
    item: [scriptedRequest('Ping')],
  };
  const fixture: MockFixtures = {
    ...fixtures,
    apiCollections: [{ id: 'widgets.postman_collection.json', fileName: 'widgets.postman_collection.json', collection }],
    // No `apiTrustedCollections` — untrusted, exactly like a fresh checkout.
    apiScriptRun: { results: [{ name: 'ok', passed: true }], logs: [], error: null },
  };
  await installMockBridge(page, fixture);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await page.getByText('Ping', { exact: true }).click();
  await page.getByRole('button', { name: 'Scripts' }).click();
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('This collection contains scripts. Run them?')).toBeVisible();

  await page.getByRole('button', { name: 'Run once' }).click();
  await expect(page.getByText('This collection contains scripts. Run them?')).toBeHidden();
  await expect(page.getByText('ok', { exact: true })).toBeVisible();

  /*
    Reload rather than re-send in place: `apiClient` itself is rebuilt fresh
    on every navigation (`addInitScript` re-runs), which is the honest analogue
    of what a real reload does to *this session's* in-memory trust state —
    the marker a real "Always" would have written to a gitignored
    `.local.json` simply never existed, because "Run once" never calls
    `setScriptTrust`. Re-sending proves the same thing a fresh main process
    would show: the collection is exactly as untrusted as it was before.
  */
  await page.reload();
  await clickRailLink(page, 'API Client');
  await page.getByText('Ping', { exact: true }).click();
  await page.getByRole('button', { name: 'Scripts' }).click();
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('This collection contains scripts. Run them?')).toBeVisible();
});

const runItem = (
  name: string,
  status: 'passed' | 'failed' | 'error',
  overrides: Record<string, unknown> = {},
) => ({
  itemPath: [name],
  name,
  method: 'GET',
  status,
  durationMs: 12,
  response: {
    status: status === 'error' ? 0 : 200,
    statusText: status === 'error' ? '' : 'OK',
    headers: {},
    body: '{"ok":true}',
    bodyIsJson: true,
    durationMs: 12,
    sizeBytes: 11,
    truncated: false,
    warnings: [],
  },
  assertions: status === 'failed' ? [{ name: 'is ok', passed: false, error: 'boom' }] : [],
  error: status === 'error' ? 'transport failure' : null,
  ...overrides,
});

const runnerCollection = {
  info: { name: 'Suite', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  item: [
    { name: 'One', request: { method: 'GET', url: { raw: '{{baseUrl}}/a' } } },
    { name: 'Two', request: { method: 'GET', url: { raw: '{{baseUrl}}/b' } } },
    { name: 'Three', request: { method: 'GET', url: { raw: '{{baseUrl}}/c' } } },
    { name: 'Four', request: { method: 'GET', url: { raw: '{{baseUrl}}/d' } } },
  ],
};

async function openRunner(page: Page): Promise<void> {
  await page.getByText('One', { exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Run collection…' }).click();
}

test('running a four-request fixture collection shows the aggregate summary', async ({ page }) => {
  const fixture: MockFixtures = {
    ...fixtures,
    apiCollections: [{ id: 'suite.postman_collection.json', fileName: 'suite.postman_collection.json', collection: runnerCollection }],
    apiTrustedCollections: ['suite.postman_collection.json'],
    apiRunItems: [runItem('One', 'passed'), runItem('Two', 'failed'), runItem('Three', 'passed'), runItem('Four', 'passed')],
    apiRunItemDelayMs: 15,
  };
  await installMockBridge(page, fixture);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await openRunner(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  await expect(page.getByText('4/4')).toBeVisible();
  await expect(page.getByText('3 passed')).toBeVisible();
  await expect(page.getByText('1 failed')).toBeVisible();
});

test('Stop mid-run leaves the remainder marked skipped', async ({ page }) => {
  const fixture: MockFixtures = {
    ...fixtures,
    apiCollections: [{ id: 'suite.postman_collection.json', fileName: 'suite.postman_collection.json', collection: runnerCollection }],
    apiTrustedCollections: ['suite.postman_collection.json'],
    apiRunItems: [runItem('One', 'passed'), runItem('Two', 'passed'), runItem('Three', 'passed'), runItem('Four', 'passed')],
    // Slow enough that a spec has time to click Stop between two events.
    apiRunItemDelayMs: 250,
  };
  await installMockBridge(page, fixture);
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await openRunner(page);
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // "One" has landed (the summary strip's live count is the unique signal —
  // "One" itself renders in both the tree on the left and the runner's own
  // list, so it is not a safe locator here) — stop before "Two" settles.
  await expect(page.getByText('1/4')).toBeVisible();
  await page.getByRole('button', { name: 'Stop' }).click();

  await expect(page.getByText('Aborted')).toBeVisible();
  await expect(page.getByText(/skipped$/)).toBeVisible();
  // "One" is the only request that actually ran.
  await expect(page.getByText('1/4')).toBeVisible();
});
