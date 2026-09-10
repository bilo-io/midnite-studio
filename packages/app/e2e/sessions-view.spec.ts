import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Sessions view's provider filter.
 *
 * Phase 82 Theme C wave 5 moved this file's 3 tests to
 * `src/features/sessions/sessions-view.bridge.test.tsx`, mounting
 * `SessionsView` directly — the trigger's label, narrowing the list, the
 * multiselect staying open across a second pick, clearing back to "All
 * providers", and the ending-facet AND-combination. The one test kept here is
 * a smoke test that the view is actually reachable through the real rail —
 * everything about what the provider filter itself does now lives in the
 * jsdom test above.
 */

const closedSession = (over: Record<string, unknown> = {}) => ({
  id: 'session-1',
  kind: 'shell',
  title: 'midnite-studio',
  cwd: '/tmp/midnite-studio',
  repoId: 'repo-1',
  createdAt: 1_700_000_000_000,
  closedAt: 1_700_000_100_000,
  exitCode: null,
  reason: 'closed',
  transcriptBytes: 128,
  ...over,
});

const base: MockFixtures = {
  ...fixtures,
  closedSessions: [
    closedSession({
      id: 'claude-1',
      kind: 'agent',
      agentId: 'claude',
      name: 'claude-run',
      createdAt: 1_700_000_000_000,
      closedAt: 1_700_000_300_000,
    }),
  ],
};

const list = (page: Page) => page.getByRole('list', { name: 'Closed sessions' });

test('the Sessions view is reachable from the rail and lists closed sessions', async ({ page }) => {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Sessions');
  await expect(list(page)).toBeVisible();
  await expect(list(page).getByText('claude-run')).toBeVisible();
});
