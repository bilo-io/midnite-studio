import { expect, test } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  mockSha,
  REPRODUCIBLE_REMOTE,
  seedForgeWritesConsent,
  shotPath,
} from './shots-helper';

/**
 * The committed screenshot for Phase 50 Theme E — "Add to project" from the
 * Reviews page. Follows `review-writes-shots.spec.ts`'s pattern: a spec, not
 * a one-off script, so the image can be regenerated when the surface
 * changes.
 */

const OUT = '../../docs/screenshots/phase-50-add-to-project';

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
  title: 'The review write path, behind one consent switch',
  state: 'open',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  checks: 'failing',
  headBranch: 'feature/phase-20-review-writes',
  author: 'bilo',
  mergedAt: null,
  closedAt: null,
  url: 'https://github.com/bilo-io/midnite-studio/pull/214',
};

const BOARD_A = {
  id: 'PVT_1',
  number: 7,
  title: 'Roadmap',
  url: 'https://github.com/orgs/bilo-io/projects/7',
  closed: false,
};

const BOARD_B = {
  id: 'PVT_2',
  number: 9,
  title: 'Bugs',
  url: 'https://github.com/orgs/bilo-io/projects/9',
  closed: false,
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
        body: 'The phase’s one deliberate write path, kept in `gh-write.ts` so `gh-cli.ts`’s “strictly reads” comment stays literally true.',
        headSha: HEAD_SHA,
        baseBranch: 'main',
        additions: 1284,
        deletions: 196,
        changedFiles: 16,
        mergeable: 'MERGEABLE',
        commitCount: 14,
        commits: [],
        reviewRequests: ['ana'],
      },
    },
    pullFiles: { '214': { files: [] } },
    pullComments: { '214': [] },
    runDetail: {},
    runLogs: {},
  },
  forgeProject: {
    projects: [BOARD_A, BOARD_B],
    fields: {},
    items: {},
  },
};

test('add to project menu', async ({ page }) => {
  await seedForgeWritesConsent(page);
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await page.getByText(pull.title, { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pull request #214' })).toBeVisible();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Add to project', exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: shotPath(OUT, 'add-to-project-menu.png') });
});
