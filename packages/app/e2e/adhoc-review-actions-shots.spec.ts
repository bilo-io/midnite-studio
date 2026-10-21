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

const OUT = '../../docs/screenshots/review-actions';
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
  title: 'Review action bar with expressive hover colors',
  state: 'open',
  isDraft: true,
  reviewDecision: 'REVIEW_REQUIRED',
  checks: 'success',
  headBranch: 'feature/review-actions-hover-colors',
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
        body: 'Pull request demonstrating review action bar compact icon buttons and hover reveals.',
        headSha: HEAD_SHA,
        baseBranch: 'main',
        additions: 128,
        deletions: 34,
        changedFiles: 4,
        mergeable: 'MERGEABLE',
        commitCount: 2,
        commits: [],
        reviewRequests: ['ana'],
      },
    },
    pullFiles: {
      '214': {
        files: [],
      },
    },
    pullComments: { '214': [] },
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

test('review action bar unhovered and hovered states', async ({ page }) => {
  test.setTimeout(120000);
  await setTheme(page, 'dark');
  await openPull(page);
  const region = page.getByRole('region', { name: 'Pull request #214' });
  const bar = region.locator('div.shrink-0.px-3.py-2');
  await expect(bar).toBeVisible();

  const hoverShot = async (btnName: string, filename: string) => {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await bar.getByRole('button', { name: btnName, exact: true }).hover();
    await page.waitForTimeout(250);
    await bar.screenshot({ path: shotPath(OUT, filename) });
  };

  // 1. Unhovered dark (compact icon buttons)
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  await bar.screenshot({ path: shotPath(OUT, 'review-actions-unhovered-dark.png') });

  // 2. Hover Approve (green)
  await hoverShot('Approve', 'review-actions-hover-approve.png');

  // 3. Hover Request changes (red)
  await hoverShot('Request changes', 'review-actions-hover-changes.png');

  // 4. Hover Comment (blue)
  await hoverShot('Comment', 'review-actions-hover-comment.png');

  // 5. Hover Discuss (teal/turquoise with double speech bubbles)
  await hoverShot('Discuss', 'review-actions-hover-discuss.png');

  // 6. Hover Ready for review (amber)
  await hoverShot('Ready for review', 'review-actions-hover-ready.png');

  // 7. Hover Request review (indigo)
  await hoverShot('Request review', 'review-actions-hover-request-review.png');

  // 8. Hover Add to tasks (slate)
  await hoverShot('Add to tasks', 'review-actions-hover-tasks.png');

  // 9. Hover Merge (purple)
  await hoverShot('Merge', 'review-actions-hover-merge.png');

  // 10. Hover AI Review (violet)
  await hoverShot('Review', 'review-actions-hover-ai-review.png');

  // 11. Light mode unhovered & hovered
  await setTheme(page, 'light');
  await page.waitForTimeout(300);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  await bar.screenshot({ path: shotPath(OUT, 'review-actions-unhovered-light.png') });

  await hoverShot('Approve', 'review-actions-hover-approve-light.png');
});
