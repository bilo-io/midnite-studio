import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Issues section, and the job peek under a run row.
 *
 * The parsers are covered under bare vitest against captured `gh` output —
 * what none of those can show is that "issues are turned off" reaches the
 * sidebar as a calm sentence rather than as the red card an error would draw,
 * or that expanding a run row costs a fetch only once someone expands it.
 */

const MAIN = '/tmp/midnite-git';

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
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
  url: 'https://github.com/bilo-io/midnite-git/issues/42',
  ...over,
});

const run = {
  id: '1',
  name: 'CI',
  status: 'completed',
  conclusion: 'failure',
  headBranch: 'main',
  headSha: 'a'.repeat(40),
  createdAt: '2026-08-26T10:00:00Z',
  url: 'https://github.com/bilo-io/midnite-git/actions/runs/1',
  event: 'push',
  workflowId: '900',
  workflowName: 'CI',
  number: 128,
};

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
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls,
      ),
    )
    .toContain('https://github.com/bilo-io/midnite-git/issues/42');
});

test('a repo with issues turned off says so, and does not look broken', async ({ page }) => {
  await open(page, {
    ...base,
    forge: { cli: { reason: 'ready' }, issues: [], issuesDisabled: true },
  });

  await page.getByRole('button', { name: 'Issues', exact: true }).click();

  await expect(page.getByText('Issues are turned off for this repository.')).toBeVisible();
  // The distinction the `disabled` field exists for: a repository behaving as
  // its owner configured it must not read as a repository that has no issues,
  // nor as one whose issue listing failed.
  await expect(page.getByText('No open issues.')).toHaveCount(0);
});

test('a failed listing is a different empty from an empty listing', async ({ page }) => {
  await open(page, {
    ...base,
    forge: { cli: { reason: 'ready' }, issues: [], error: 'HTTP 502: Bad gateway' },
  });

  await page.getByRole('button', { name: 'Issues', exact: true }).click();
  await expect(page.getByText('HTTP 502: Bad gateway')).toBeVisible();
});

test('expanding a run row shows its jobs, and only then fetches them', async ({ page }) => {
  await open(page, {
    ...base,
    forge: {
      cli: { reason: 'ready' },
      runs: [run],
      runDetail: {
        '1': {
          jobs: [
            {
              id: '10',
              name: 'typecheck',
              status: 'completed',
              conclusion: 'success',
              startedAt: '2026-08-26T10:00:10Z',
              completedAt: '2026-08-26T10:01:00Z',
              url: 'https://github.com/bilo-io/midnite-git/actions/runs/1/job/10',
              steps: [
                {
                  number: 1,
                  name: 'Set up job',
                  status: 'completed',
                  conclusion: 'success',
                  startedAt: null,
                  completedAt: null,
                },
              ],
            },
            {
              id: '11',
              name: 'test',
              status: 'completed',
              conclusion: 'failure',
              startedAt: '2026-08-26T10:00:10Z',
              completedAt: '2026-08-26T10:04:00Z',
              url: 'https://github.com/bilo-io/midnite-git/actions/runs/1/job/11',
              steps: [],
            },
          ],
        },
      },
    },
  });

  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  /*
    `getByRole('img', …)`, not `getByText`: a settled status renders as a bare
    coloured glyph now, so its word survives only as the mark's accessible
    name. Asserting on the name rather than on visible text is also the stronger
    check — it fails if the pill loses the label a screen reader needs.
  */
  await expect(page.getByRole('img', { name: 'Failed', exact: true })).toBeVisible();
  // Nothing has expanded yet, so nothing has been asked of `gh run view`.
  // `exact: true` because the sidebar's own "Tests" section toggle otherwise
  // substring-matches this job's name.
  await expect(page.getByRole('button', { name: 'test', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Jobs in CI #128' }).click();

  // The question the red dot leaves open: which job failed.
  await expect(page.getByRole('button', { name: 'typecheck' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'test', exact: true })).toBeVisible();
  await expect(page.getByText('1 steps')).toBeVisible();

  // Two verbs, two controls — the chevron peeks, the row body opens a tab. So
  // expanding must not have navigated anywhere.
  await expect(page.getByRole('tab', { name: /CI/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Jobs in CI #128' }).click();
  await expect(page.getByRole('button', { name: 'typecheck' })).toHaveCount(0);
});

test('a job with no steps renders as a job, not as an error', async ({ page }) => {
  await open(page, {
    ...base,
    forge: {
      cli: { reason: 'ready' },
      runs: [run],
      runDetail: {
        '1': {
          jobs: [
            {
              id: '12',
              name: 'deploy',
              status: 'completed',
              conclusion: 'skipped',
              startedAt: null,
              completedAt: null,
              url: '',
              steps: [],
            },
          ],
        },
      },
    },
  });

  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await page.getByRole('button', { name: 'Jobs in CI #128' }).click();

  // `steps: []` is what GitHub sends for a job an `if:` declined to run.
  await expect(page.getByRole('button', { name: 'deploy' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Skipped', exact: true })).toBeVisible();
  // No url means nothing to open — the row says so by being disabled rather
  // than by opening a link that goes nowhere.
  await expect(page.getByRole('button', { name: 'deploy' })).toBeDisabled();
});
