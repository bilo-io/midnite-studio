import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Issues view, assembled (Phase 54 Theme C).
 *
 * `issue-list.test.tsx`/`issue-detail.test.tsx` already cover rows, the empty
 * list, the disabled-tracker sentence and the error notice under bare RTL.
 *
 * Phase 82 Theme C wave 5 moved the rest of this file's tests to
 * `src/features/issues/issues-view.bridge.test.tsx`, mounting `IssuesView`
 * directly: the initial-selection default, a row's own body/conversation
 * fetch, the list's labels/state, and the disabled-tracker sentence. **The 1
 * test left here is not about anything inside `IssuesView`** — it is the
 * global command dispatcher and the rail's view routing, which mounting the
 * view alone bypasses entirely.
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

test('reaches the view with Mod+Shift+i from anywhere', async ({ page }) => {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.keyboard.press('Meta+Shift+i');
  await expect(list(page)).toBeVisible();
});
