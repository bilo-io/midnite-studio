import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The committed screenshots for Phase 20 Themes F and G.
 *
 * A spec rather than a one-off script, following `reviews-shots.spec.ts`, so the
 * images can be regenerated when the surface changes instead of going quietly
 * stale — and so the fixture that produces them is reviewable.
 *
 * The fixture is deliberately the *interesting* state rather than the default
 * one: writes enabled, a fourteen-commit branch, a reviewer already awaiting,
 * and a failed run. A shot of the default state would be a row of greyed
 * buttons, which is a real thing to see but not the thing being reviewed.
 */

/* Playwright runs with `packages/app` as its cwd, so the repo-root docs tree is
   two levels up. */
const OUT = '../../docs/screenshots/phase-20-review-writes';

const MAIN = '/tmp/midnite-git';
const HEAD_SHA = 'beef'.padEnd(40, '0');

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
  },
];

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
  url: 'https://github.com/bilo-io/midnite-git/pull/214',
};

const line = (
  kind: 'add' | 'del' | 'ctx',
  text: string,
  oldNo: number | null,
  newNo: number | null,
): Record<string, unknown> => ({ kind, oldNo, newNo, text, ranges: [], noNewline: false });

const file = (
  path: string,
  change: string,
  heading: string,
  oldStart: number,
  newStart: number,
  lines: Record<string, unknown>[],
): Record<string, unknown> => ({
  path,
  oldPath: null,
  change,
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      oldStart,
      oldLines: lines.length,
      newStart,
      newLines: lines.length,
      heading,
      lines,
    },
  ],
  insertions: lines.filter((l) => l['kind'] === 'add').length,
  deletions: lines.filter((l) => l['kind'] === 'del').length,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

const commit = (sha: string, subject: string) => ({ sha: sha.padEnd(40, '0'), subject });

const run = {
  id: '5120',
  name: 'CI',
  status: 'completed',
  conclusion: 'failure',
  headBranch: pull.headBranch,
  headSha: HEAD_SHA,
  createdAt: '2026-08-27T13:10:00Z',
  startedAt: '2026-08-27T13:10:04Z',
  updatedAt: '2026-08-27T13:14:52Z',
  url: 'https://github.com/bilo-io/midnite-git/actions/runs/5120',
  event: 'pull_request',
  workflowId: '900',
  workflowName: 'CI',
  number: 512,
  displayTitle: pull.title,
};

const step = (n: number, name: string, conclusion: string): Record<string, unknown> => ({
  number: n,
  name,
  status: 'completed',
  conclusion,
  startedAt: '2026-08-27T13:10:10Z',
  completedAt: '2026-08-27T13:12:30Z',
});

const data: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  refs: [LOCAL_REF],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    runs: [run],
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
        commits: [
          commit('f1', 'test(shared): cover the six write payloads'),
          commit('e2', 'feat(reviews): re-run checks from the Checks tab'),
          commit('d3', 'feat(reviews): the review action bar and merge confirm'),
          commit('c4', 'feat(desktop): six writes in gh-write.ts'),
          commit('b5', 'refactor(forge): extract gh-shell.ts'),
        ],
        reviewRequests: ['ana'],
      },
    },
    pullFiles: {
      '214': {
        files: [
          file(
            'packages/desktop/src/main/forge/gh-write.ts',
            'modified',
            'export function reviewCommand',
            84,
            84,
            [
              line('ctx', 'const REVIEW_FLAG: Record<ForgeReviewEvent, string> = {', 84, 84),
              line('ctx', "  APPROVE: '--approve',", 85, 85),
              line('add', "  REQUEST_CHANGES: '--request-changes',", null, 86),
              line('add', "  COMMENT: '--comment',", null, 87),
              line('add', '};', null, 88),
              line('add', '', null, 89),
              line('add', 'export function reviewCommand(', null, 90),
              line('add', '  forge: Forge,', null, 91),
              line('add', '  number: number,', null, 92),
              line('add', '  event: ForgeReviewEvent,', null, 93),
              line('add', '  body: string,', null, 94),
              line('add', '): string {', null, 95),
              line(
                'add',
                '  return `gh pr review ${number} ${repoFlag(forge)} ${REVIEW_FLAG[event]}${bodyFlag(body)}`;',
                null,
                96,
              ),
              line('add', '}', null, 97),
            ],
          ),
          file(
            'packages/shared/src/ipc/schemas.ts',
            'modified',
            'export const ForgePullMergeRequest',
            412,
            412,
            [
              line('ctx', 'export const ForgePullMergeRequest = ForgePullRequest.extend({', 412, 412),
              line('del', '  method: ForgeMergeMethodSchema.default(\'squash\'),', 413, null),
              line('add', '  method: ForgeMergeMethodSchema,', null, 413),
              line('ctx', '});', 414, 414),
            ],
          ),
        ],
      },
    },
    pullComments: { '214': [] },
    runDetail: {
      '5120': {
        jobs: [
          {
            id: '20',
            name: 'typecheck',
            status: 'completed',
            conclusion: 'success',
            startedAt: '2026-08-27T13:10:10Z',
            completedAt: '2026-08-27T13:12:30Z',
            url: 'https://github.com/bilo-io/midnite-git/actions/runs/5120/job/20',
            steps: [step(1, 'Set up job', 'success'), step(2, 'moon run :typecheck', 'success')],
          },
          {
            id: '21',
            name: 'test',
            status: 'completed',
            conclusion: 'failure',
            startedAt: '2026-08-27T13:10:10Z',
            completedAt: '2026-08-27T13:14:48Z',
            url: 'https://github.com/bilo-io/midnite-git/actions/runs/5120/job/21',
            steps: [
              step(1, 'Set up job', 'success'),
              step(2, 'pnpm install', 'success'),
              step(3, 'moon run :test', 'failure'),
            ],
          },
        ],
      },
    },
    runLogs: {
      '5120': {
        lines: [
          'test\tmoon run :test\t2026-08-27T13:14:40Z FAIL src/ipc/ipc.test.ts > forge schemas',
          'test\tmoon run :test\t2026-08-27T13:14:40Z → expected 19 forge channels to equal 13',
        ],
      },
    },
  },
};

/** Seed the consent flag, then open the one pull request. */
async function openPull(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'midnite-git.ui',
      JSON.stringify({ state: { forgeWritesEnabled: true }, version: 2 }),
    );
  });
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByText(pull.title, { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pull request #214' })).toBeVisible();
  await page.waitForTimeout(800);
}

test('action bar light', async ({ page }) => {
  await openPull(page);
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page
    .getByRole('textbox', { name: /Approve/ })
    .fill('Reads well. One note on the probe cache, otherwise ship it.');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/action-bar-light.png` });
});

test('action bar dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openPull(page);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.getByRole('button', { name: 'Request review' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/action-bar-dark.png` });
});

test('merge confirm', async ({ page }) => {
  await openPull(page);
  await page.getByRole('button', { name: 'Merge', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Merge pull request #214/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('radio', { name: /Squash and merge/ }).check();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/merge-confirm.png` });
});

test('re-run on the checks tab', async ({ page }) => {
  await openPull(page);
  await page.getByRole('tab', { name: /Checks/ }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/checks-rerun.png` });
});

test('the settings switch', async ({ page }) => {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Reviews' })
    .click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/settings-reviews.png` });
});
