import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 66 Theme H — the API Client is reachable, and its empty state is a
 * state rather than a blank pane.
 *
 * Theme B registered `apiClient` in four places that have to agree —
 * the `ViewId` union, `ui-store.ts`'s separate `VIEW_IDS` array (which
 * `viewForPath` derives from), `VIEW_COMPONENT` and the `WORKSPACE` rail
 * group. `tsc` catches a missing `VIEW_COMPONENT` entry because that type is a
 * `Record<ViewId, …>`, but it cannot catch the rail group omitting the row or
 * `VIEW_IDS` disagreeing with the union — the view would simply be
 * unreachable, and every unit test would still pass.
 *
 * `view.apiClient` deliberately has no chord (Decision 5), so the rail link is
 * the only navigation this spec can assert — which is exactly why it matters.
 */
const noCollections: MockFixtures = { ...fixtures };

test('API Client is reachable from the Workspace rail and renders an empty state', async ({
  page,
}) => {
  await installMockBridge(page, noCollections);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await clickRailLink(page, 'API Client');

  // The view's own header, not the rail label — proves the component mounted
  // rather than the rail merely highlighting a row.
  await expect(
    page.getByRole('heading', { name: 'API Client', level: 2 }),
  ).toBeVisible();

  // With no collection open there is no request to build, and the right pane
  // says so. A blank pane here is the failure this asserts against: it is what
  // an error boundary renders when a bridge method is missing.
  await expect(page.getByText('Open a request from the tree to build and send it.')).toBeVisible();
});

test('a missing collection list leaves the view usable rather than blank', async ({ page }) => {
  // `listCollections` answering an empty list is the ordinary first-run state.
  // The tree renders its own empty copy and the view still mounts; nothing
  // throws into the boundary.
  await installMockBridge(page, { ...fixtures, apiCollections: [] });
  await page.goto('/');
  await clickRailLink(page, 'API Client');

  await expect(page.getByRole('heading', { name: 'API Client', level: 2 })).toBeVisible();
  // The pane is present and empty — not absent.
  await expect(page.getByText('Open a request from the tree to build and send it.')).toBeVisible();
});
