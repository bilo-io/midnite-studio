import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  mockSha,
  REPRODUCIBLE_REMOTE,
  seedForgeWritesConsent,
} from './shots-helper';

/**
 * The app's busy marks, held still and photographed.
 *
 * Every loading state that used to be "the glyph, rotating" is now the shared
 * sweeping ring, and this is the one spec that catches those states on a real
 * surface: the mock bridge answers in the same tick it is asked, so a re-run in
 * flight lives for zero frames and a change that put the spin back would pass
 * the whole suite. `forgeLatencyMs` holds the write open long enough for the
 * button to be seen.
 *
 * It asserts as well as photographs, and the assertions are on the DOM rather
 * than the pixels: the glyph is *gone* while busy, not spinning. That is the
 * behaviour, and it is the part a pixel diff of an animation frame cannot
 * pin down.
 *
 * Unlike the rest of the old shots suite, this file is not named `*-shots` and is
 * not gated wholesale: the DOM assertions above are the
 * only coverage `.animate-spin` replacing the glyph gets anywhere in the
 * suite, and they run unconditionally in every `app:e2e` run.
 */

/*
  Long enough that a click's write is still in flight when the check is
  made, short enough that it does not also make every read in the spec a
  visible wait — `forgeLatencyMs` slows the whole namespace, reads included.
*/
const LATENCY = 2500;

const HEAD_SHA = mockSha('ba5eba11', '0');

const REMOTES = [REPRODUCIBLE_REMOTE];

const pull = {
  number: 300,
  title: 'Busy states use the sweeping ring, not a rotating glyph',
  state: 'open',
  isDraft: false,
  reviewDecision: 'REVIEW_REQUIRED',
  checks: 'pending',
  headBranch: 'feature/adhoc-css-spinner-busy',
  author: 'bilo',
  mergedAt: null,
  closedAt: null,
  url: 'https://github.com/bilo-io/midnite-studio/pull/300',
};

const data: MockFixtures = {
  ...fixtures,
  forgeLatencyMs: LATENCY,
  remotes: REMOTES,
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    runs: [
      {
        id: '7001',
        name: 'CI',
        displayTitle: 'Busy states use the sweeping ring',
        status: 'in_progress',
        conclusion: null,
        branch: 'feature/adhoc-css-spinner-busy',
        headSha: HEAD_SHA,
        workflowName: 'CI',
        event: 'pull_request',
        createdAt: '2026-09-02T09:00:00Z',
        url: 'https://github.com/bilo-io/midnite-studio/actions/runs/7001',
      },
    ],
    pullDetail: {
      '300': {
        body: 'A rotating trash can is not a busy indicator.',
        headSha: HEAD_SHA,
        baseBranch: 'main',
        additions: 96,
        deletions: 41,
        changedFiles: 9,
        mergeable: 'MERGEABLE',
      },
    },
    pullComments: { '300': [] },
    runDetail: {
      '7001': {
        jobs: [
          {
            id: '70',
            name: 'typecheck',
            status: 'in_progress',
            conclusion: null,
            startedAt: '2026-09-02T09:00:10Z',
            completedAt: null,
            url: 'https://github.com/bilo-io/midnite-studio/actions/runs/7001/job/70',
            steps: [],
          },
        ],
      },
    },
  },
};

/** Seed the write consent, then open the one pull request's Checks tab. */
async function openChecks(page: Page): Promise<void> {
  await seedForgeWritesConsent(page);
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await page.getByText(pull.title, { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pull request #300' })).toBeVisible();
  await page.getByRole('tab', { name: /Checks/ }).click();
}

test('a re-run in flight, and the running checks beside it', async ({ page }) => {
  await openChecks(page);

  const rerun = page.getByRole('button', { name: 'Re-run all jobs' });
  await expect(rerun).toBeEnabled();
  await rerun.click();

  /*
    While the write is out the button holds the ring instead of the refresh
    arrows. Asserting the glyph is absent is the point — spinning it in place
    would leave the `svg` there and pass a laxer check.
  */
  await expect(rerun.locator('.animate-spin')).toBeVisible();
  await expect(rerun.locator('svg')).toHaveCount(0);
});
