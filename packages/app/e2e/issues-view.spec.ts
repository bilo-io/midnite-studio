import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Issues view, assembled (Phase 54 Theme C).
 *
 * `issue-list.test.tsx`/`issue-detail.test.tsx` already cover rows, the empty
 * list, the disabled-tracker sentence and the error notice under bare RTL.
 * What only the assembled app can show is that the list, the store's
 * per-repo selection and the detail's own two fetches (body, then
 * conversation) compose into one working view.
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
  id: '',
  number: 1,
  title: 'Untitled',
  state: 'open',
  author: 'bilo',
  labels: [],
  assignees: [],
  createdAt: '2026-08-01T09:00:00Z',
  updatedAt: '2026-08-01T09:00:00Z',
  url: 'https://github.com/bilo-io/midnite-studio/issues/1',
  milestone: null,
  ...over,
});

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    issues: [
      issue({
        number: 42,
        title: 'Graph rows jump on resize',
        updatedAt: '2026-08-20T09:00:00Z',
        labels: [{ name: 'bug', color: 'd73a4a' }],
      }),
      issue({
        number: 7,
        title: 'Dark mode contrast',
        updatedAt: '2026-08-25T09:00:00Z',
        state: 'closed',
      }),
    ],
    issueDetail: {
      '42': { body: 'The rows **jump** when the window resizes.' },
      '7': { body: '' },
    },
    issueComments: {
      '42': [
        {
          id: 'c1',
          kind: 'comment',
          author: 'reviewer-1',
          body: 'Confirmed, reproduces for me too.',
          createdAt: '2026-08-21T09:00:00Z',
          url: '',
          reviewState: null,
        },
      ],
      '7': [],
    },
  },
};

const list = (page: Page) => page.getByRole('list', { name: 'Issues' });
const detail = (page: Page) => page.getByRole('region', { name: 'Issue detail' });

/** Land on the Issues view. Only for fixtures where it has issues to show. */
async function open(page: Page, data: MockFixtures = base): Promise<void> {
  await goToIssues(page, data);
  await expect(list(page)).toBeVisible();
}

/** Land on the Issues view whatever it ends up rendering. */
async function goToIssues(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await clickRailLink(page, 'Issues');
}

test('opens on the most recently updated issue, not the first in the fixture', async ({ page }) => {
  await open(page);

  // #7 was updated after #42, even though #42 is listed first in the fixture.
  await expect(detail(page).getByRole('heading', { level: 2 })).toContainText('Dark mode contrast');
  await expect(detail(page).getByText('Nobody has commented on this issue.')).toBeVisible();
});

test('selecting a row loads that issue’s body and conversation', async ({ page }) => {
  await open(page);

  await list(page).getByText('Graph rows jump on resize').click();

  await expect(detail(page).getByRole('heading', { level: 2 })).toContainText('Graph rows jump on resize');
  // The markdown body's own bold — `**jump**` — proves this isn't the title reused.
  await expect(detail(page).getByText('jump', { exact: true })).toBeVisible();
  await expect(detail(page).getByText('reviewer-1')).toBeVisible();
  await expect(detail(page).getByText('Confirmed, reproduces for me too.')).toBeVisible();
});

test('the list shows both issues, labelled and stateful', async ({ page }) => {
  await open(page);

  await expect(list(page).getByText('Graph rows jump on resize')).toBeVisible();
  await expect(list(page).getByText('Dark mode contrast')).toBeVisible();
  await expect(list(page).getByText('bug')).toBeVisible();
});

test('a repo with issues turned off says so, not an error', async ({ page }) => {
  await goToIssues(page, {
    ...base,
    forge: { cli: { reason: 'ready' }, issues: [], issuesDisabled: true },
  });

  await expect(page.getByText('Issues are turned off for this repository.')).toBeVisible();
  await expect(list(page)).toHaveCount(0);
});

test('reaches the view with Mod+Shift+i from anywhere', async ({ page }) => {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.keyboard.press('Meta+Shift+i');
  await expect(list(page)).toBeVisible();
});
