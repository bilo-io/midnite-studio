import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 70 Themes B and C — the Scripts tab's own rendering of a script's
 * outcome, the consent bar's *Run once* path, and the collection runner's
 * aggregate summary plus a mid-run Stop.
 *
 * Phase 82 Theme C wave 5 moved this file's assertions to
 * `src/features/api-client/api-client-scripts.bridge.test.tsx`, mounting
 * `ApiClientView` directly with the same fixtures (Monaco mocked away, the
 * same stand-in `request-builder.test.tsx` already uses for it). **One
 * smoke test stays here** — the simplest "the view renders and shows X"
 * case for the Scripts tab, reached through real rail navigation, so the
 * suite still proves it end to end in a real browser at least once. None of
 * the original assertions needed real browser behaviour on their own — the
 * sandbox itself is `script-runner.test.ts`'s job under bare vitest, and
 * every assertion here is only about the UI's reaction to a canned outcome.
 */

const scriptedRequest = (name: string) => ({
  name,
  request: { method: 'GET', url: { raw: '{{baseUrl}}/things' } },
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
  await page.getByRole('button', { name: /^Scripts/ }).click();
  await page.getByRole('button', { name: 'Send' }).click();

  await expect(page.getByText('status is 200')).toBeVisible();
  await expect(page.getByText('has an id')).toBeVisible();
  await expect(page.getByText('expected undefined to equal 1')).toBeVisible();

  // Never an error boundary — this is a normal, renderable outcome. (Monaco
  // itself always renders two empty `role="alert"` live regions of its own,
  // `class="monaco-alert"`, unrelated to `ErrorBoundary` — asserting no
  // *labelled* alert exists is the meaningful check.)
  await expect(page.getByRole('alert', { name: /stopped rendering/i })).toBeHidden();
});
