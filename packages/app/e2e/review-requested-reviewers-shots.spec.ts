import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  mockSha,
  REPRODUCIBLE_REMOTE,
  seedForgeWritesConsent,
  setShotViewport,
  setTheme,
  shotPath,
} from './shots-helper';

const OUT = '../../docs/screenshots/review-requested-reviewers';
const MAIN = '/tmp/midnite-studio';
const HEAD_SHA = mockSha('beef', '0');
const REMOTES = [REPRODUCIBLE_REMOTE];

const LOCAL_REF = {
  name: 'main',
  fullName: 'refs/heads/main',
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: true,
  worktreePath: MAIN,
};

const pull = {
  number: 214,
  title: 'Review action bar with requested reviewers and status badges',
  state: 'open',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  checks: 'success',
  headBranch: 'feature/review-requested-reviewers',
  author: 'bilo',
  mergedAt: null,
  closedAt: null,
  url: 'https://github.com/bilo-io/midnite-studio/pull/214',
};

const data: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  refs: [LOCAL_REF],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    runs: [],
    pullDetail: {
      '214': {
        body: 'Pull request demonstrating GitHub-like reviewer request dropdown and avatar status badges.',
        headSha: HEAD_SHA,
        baseBranch: 'main',
        additions: 140,
        deletions: 22,
        changedFiles: 5,
        mergeable: 'MERGEABLE',
        commitCount: 3,
        commits: [],
        reviewRequests: ['ana', 'dev-lead'],
      },
    },
    pullFiles: {
      '214': {
        files: [],
      },
    },
    pullComments: {
      '214': [
        {
          id: 'c1',
          kind: 'review',
          author: 'alice',
          body: 'LGTM! Great work.',
          createdAt: '2026-10-06T10:00:00Z',
          url: '',
          reviewState: 'APPROVED',
        },
        {
          id: 'c2',
          kind: 'review',
          author: 'bob',
          body: 'Please address the edge case in status resolution.',
          createdAt: '2026-10-06T11:00:00Z',
          url: '',
          reviewState: 'CHANGES_REQUESTED',
        },
        {
          id: 'c3',
          kind: 'review',
          author: 'charlie',
          body: 'Left a few inline notes.',
          createdAt: '2026-10-06T11:30:00Z',
          url: '',
          reviewState: 'COMMENTED',
        },
        {
          id: 'c4',
          kind: 'comment',
          author: 'dan',
          body: 'Following this PR.',
          createdAt: '2026-10-06T11:45:00Z',
          url: '',
          reviewState: null,
        },
      ],
    },
    runDetail: {},
    runLogs: {},
  },
};

async function openPull(page: Page): Promise<void> {
  await seedForgeWritesConsent(page);
  await installMockBridge(page, data);
  await setShotViewport(page, 'wide');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 60000 });
  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await page.getByText(pull.title, { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pull request #214' })).toBeVisible();
  await page.waitForTimeout(600);
}

test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');

test('reviewer request experience: avatars and dropdown popover', async ({ page }) => {
  test.setTimeout(120000);

  // --- DARK MODE ---
  await setTheme(page, 'dark');
  await openPull(page);

  const region = page.getByRole('region', { name: 'Pull request #214' });
  const bar = region.locator('div.shrink-0.px-3.py-2');
  await expect(bar).toBeVisible();

  // 1. Reviewer avatars on action bar (Dark)
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);
  await bar.screenshot({ path: shotPath(OUT, 'reviewer-avatars-bar-dark.png') });

  // 2. Open "Request review" dropdown popover (Dark)
  const requestReviewBtn = bar.getByRole('button', { name: 'Request review', exact: true });
  await requestReviewBtn.click();
  await page.waitForTimeout(300);

  const dropdown = page.getByTestId('reviewer-picker-dropdown');
  await expect(dropdown).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'reviewer-dropdown-popover-dark.png') });

  // 3. Filter reviewers by search input
  const filterInput = dropdown.getByPlaceholder('Filter reviewers...');
  await filterInput.fill('ch');
  await page.waitForTimeout(200);
  await page.screenshot({ path: shotPath(OUT, 'reviewer-dropdown-filtered-dark.png') });

  // Reset filter
  await filterInput.fill('');
  await page.waitForTimeout(100);

  // Close dropdown
  await requestReviewBtn.click();
  await page.waitForTimeout(200);

  // --- LIGHT MODE ---
  await setTheme(page, 'light');
  await page.waitForTimeout(300);

  // 4. Reviewer avatars on action bar (Light)
  await bar.screenshot({ path: shotPath(OUT, 'reviewer-avatars-bar-light.png') });

  // 5. Open "Request review" dropdown popover (Light)
  await requestReviewBtn.click();
  await page.waitForTimeout(300);
  await expect(dropdown).toBeVisible();
  await page.screenshot({ path: shotPath(OUT, 'reviewer-dropdown-popover-light.png') });
});
