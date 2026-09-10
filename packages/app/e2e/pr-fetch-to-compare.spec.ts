import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Theme H's reverted item (Phase 26 refinement x1): "Fetch to compare" —
 * a fork PR's base blob is not necessarily in the local object store, and
 * before this the image diff would silently degrade to the plain binary
 * treatment with no explanation.
 *
 * Phase 82 Theme C wave 5 moved both assertions here to
 * `src/features/reviews/pr-fetch-to-compare.bridge.test.tsx`, mounting
 * `PrDetail` directly. One smoke test stays here, proving the Reviews rail
 * and PR row actually reach the Files tab through a real page load.
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

const HEAD_SHA = 'a'.repeat(40);
const BASE_SHA = 'b'.repeat(40);
const IMAGE_PATH = 'docs/logo.png';

const pull = {
  number: 42,
  title: 'Reviews page',
  state: 'open',
  isDraft: false,
  reviewDecision: 'APPROVED',
  checks: 'passing',
  headBranch: 'feature/reviews',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-studio/pull/42',
};

const pullDetail = {
  body: 'Why this exists: reading a PR should not need a browser.',
  headSha: HEAD_SHA,
  baseSha: BASE_SHA,
  baseBranch: 'main',
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  mergeable: 'MERGEABLE',
};

const imageFile = {
  path: IMAGE_PATH,
  oldPath: null,
  change: 'modified',
  binary: true,
  oldMode: null,
  newMode: null,
  hunks: [],
  insertions: 0,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
};

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
};

function withPull(baseBlobExists: boolean): MockFixtures {
  return {
    ...base,
    forge: {
      cli: { reason: 'ready' },
      pulls: [pull],
      pullDetail: { '42': pullDetail },
      pullFiles: { '42': { files: [imageFile] } },
    },
    blobExists: { [`${BASE_SHA}:${IMAGE_PATH}`]: baseBlobExists },
  };
}

async function openPullFiles(page: Page, baseBlobExists: boolean): Promise<void> {
  await installMockBridge(page, withPull(baseBlobExists));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  const row = page.getByText('Reviews page', { exact: true });
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await row.click();
  await expect(page.getByRole('region', { name: 'Pull request #42' })).toBeVisible();

  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(IMAGE_PATH)).toBeVisible();
}

test('a present base blob renders the image diff, not the button', async ({ page }) => {
  await openPullFiles(page, true);

  await expect(page.getByTestId('image-diff')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fetch to compare' })).toHaveCount(0);
});
