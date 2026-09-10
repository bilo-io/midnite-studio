import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Issues section, and the job peek under a run row.
 *
 * The parsers are covered under bare vitest against captured `gh` output.
 * Phase 82 Theme C wave 5 moved every other test here to
 * `src/features/repos/forge-sections.bridge.test.tsx`, mounting
 * `IssuesSection`/`ActionsSection` directly: the disabled/failed empties, the
 * lazy job fetch, and the no-steps job. One smoke test stays here, proving
 * the sidebar actually reaches these sections through a real page load.
 */

const MAIN = '/tmp/midnite-studio';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const issue = (over: Record<string, unknown> = {}) => ({
  number: 42,
  title: 'Graph rows jump on resize',
  state: 'open',
  author: 'bilo',
  labels: [{ name: 'bug', color: 'd73a4a' }],
  assignees: [],
  createdAt: '2026-08-01T09:00:00Z',
  updatedAt: '2026-08-20T09:00:00Z',
  url: 'https://github.com/bilo-io/midnite-studio/issues/42',
  ...over,
});

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
};

async function open(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
}

/** Browser tabs opened in-app (Phase 71 Theme B's default routing for the row menu's forge link). */
const browserTabs = (page: Page) =>
  page.getByRole('tablist', { name: 'Browser tabs' }).getByRole('tab');

test('Issues lists what gh reports, and each row links out', async ({ page }) => {
  await open(page, {
    ...base,
    forge: {
      cli: { reason: 'ready' },
      issues: [issue(), issue({ number: 7, title: 'Dark mode contrast', labels: [] })],
    },
  });

  // Closed by default and issuing no query until opened, exactly like Actions
  // and Reviews: each one is a `gh` subprocess against a rate-limited API.
  await page.getByRole('button', { name: 'Issues', exact: true }).click();

  await expect(page.getByText('Graph rows jump on resize')).toBeVisible();
  // The subtitle is the row's whole context: number, author and labels.
  await expect(page.getByText('#42 · by bilo · bug')).toBeVisible();
  await expect(page.getByText('Dark mode contrast')).toBeVisible();

  await page.getByRole('button', { name: 'Actions for Graph rows jump on resize' }).click();
  await page.getByRole('menuitem', { name: 'Open issue on GitHub' }).click();
  // Phase 71 Theme B: `forgeRowMenu` routes through `openInMidnite`, which opens
  // a browser tab under the default in-app preference rather than reaching
  // `shell.openExternal` directly.
  await expect(browserTabs(page)).toHaveCount(1);
  await expect(browserTabs(page)).toHaveAccessibleName(/github\.com/);
});
