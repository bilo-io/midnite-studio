import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The dashboard as an assembled board.
 *
 * The unit tests own the parts that are functions — which widgets a repo can
 * offer, how a layout is edited, how the author filter rebuckets a calendar.
 * What only the running app can show is that the registry actually reaches the
 * DOM: that a tile can be removed and put back, that Reset layout undoes it,
 * that a repository with no GitHub remote is offered no forge widgets at all,
 * and that the board follows the sidebar's selection rather than a repo of its
 * own choosing.
 *
 * Phase 82 Theme C wave 5 moved all 10 of this file's tests to
 * `src/features/dashboard/dashboard-view.bridge.test.tsx`, mounting
 * `DashboardView` directly (with `react-grid-layout` stood in the same way
 * `dashboard-view.test.tsx`'s own unit suite already does). **One smoke test
 * stays here** — reached through the real rail navigation rather than a
 * direct mount, so the suite still proves the view is reachable end to end
 * in a real browser at least once.
 */

const MAIN = '/tmp/midnite-studio';

const GITHUB_REMOTE = {
  name: 'origin',
  fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
  pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
  forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
};

const localRef = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

const base: MockFixtures = {
  ...fixtures,
  refs: [localRef('main', { isHead: true, worktreePath: MAIN })],
  remotes: [GITHUB_REMOTE],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    runs: [],
    pulls: [
      {
        number: 7,
        title: 'Dashboard widgets',
        state: 'open',
        isDraft: false,
        reviewDecision: 'APPROVED',
        checks: 'passing',
        headBranch: 'feature/dashboard',
        author: 'bilo',
        url: 'https://github.com/bilo-io/midnite-studio/pull/7',
      },
    ],
    issues: [
      {
        number: 12,
        title: 'Sparkline stops at the cadence change',
        state: 'open',
        author: 'bilo',
        labels: [{ name: 'bug', color: 'd73a4a' }],
        assignees: [],
        updatedAt: '2026-08-20T09:00:00Z',
        createdAt: '2026-08-14T11:30:00Z',
        comments: 2,
        url: 'https://github.com/bilo-io/midnite-studio/issues/12',
      },
    ],
  },
};

async function openDashboard(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

/** A widget's tile — every one is a landmark named after its title. */
const tile = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

test('the board renders every widget as a named landmark', async ({ page }) => {
  await openDashboard(page);

  for (const name of [
    'Commit calendar',
    'Contributors',
    'Recent activity',
    'Open pull requests',
    'Open issues',
    'Latest workflow runs',
    'Repo health',
  ]) {
    await expect(tile(page, name)).toBeVisible();
  }

  // Each tile carries a real heading, so the board is navigable by heading
  // rather than being one undifferentiated region of numbers.
  await expect(tile(page, 'Contributors').getByRole('heading', { level: 3 })).toHaveText(
    'Contributors',
  );
});
