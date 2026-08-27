import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The pull-request detail: Files, Conversation and Checks.
 *
 * The parsers underneath are covered under bare vitest against captured `gh`
 * output. What only a browser can show is the part that motivated the theme —
 * that opening a pull request in the app puts its diff, its discussion and its
 * CI verdict one click apart, and that each tab pays for its own fetch rather
 * than all three loading on arrival.
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

const HEAD_SHA = 'a'.repeat(40);

const pull = {
  number: 42,
  title: 'Reviews page',
  state: 'open',
  isDraft: false,
  reviewDecision: 'APPROVED',
  checks: 'passing',
  headBranch: 'feature/reviews',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-git/pull/42',
};

const pullDetail = {
  body: 'Why this exists: reading a PR should not need a browser.',
  headSha: HEAD_SHA,
  baseBranch: 'main',
  additions: 120,
  deletions: 8,
  changedFiles: 2,
  mergeable: 'MERGEABLE',
};

/** A `FileDiff` as main would have parsed it — the shape the renderer receives. */
const fileDiff = (
  path: string,
  lines: { kind: 'add' | 'del' | 'ctx'; text: string }[],
): Record<string, unknown> => ({
  path,
  oldPath: null,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      oldStart: 1,
      oldLines: lines.length,
      newStart: 1,
      newLines: lines.length,
      heading: '',
      lines: lines.map((line, index) => ({
        kind: line.kind,
        oldNo: line.kind === 'add' ? null : index + 1,
        newNo: line.kind === 'del' ? null : index + 1,
        text: line.text,
        ranges: [],
        noNewline: false,
      })),
    },
  ],
  insertions: lines.filter((line) => line.kind === 'add').length,
  deletions: lines.filter((line) => line.kind === 'del').length,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

const run = {
  id: '1',
  name: 'CI',
  status: 'completed',
  conclusion: 'failure',
  headBranch: 'feature/reviews',
  headSha: HEAD_SHA,
  createdAt: '2026-08-26T10:00:00Z',
  url: 'https://github.com/bilo-io/midnite-git/actions/runs/1',
  event: 'pull_request',
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

const withPull = (over: Partial<NonNullable<MockFixtures['forge']>> = {}): MockFixtures => ({
  ...base,
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    pullDetail: { '42': pullDetail },
    ...over,
  },
});

/** Open the app, expand Reviews, and click into PR #42. */
async function openPull(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByText('Reviews page', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pull request #42' })).toBeVisible();
}

test('the PR header reads from the listing, then fills in from the detail fetch', async ({
  page,
}) => {
  await openPull(page, withPull());

  const header = page.getByRole('region', { name: 'Pull request #42' });
  await expect(header.getByRole('heading', { name: /#42 Reviews page/ })).toBeVisible();
  await expect(header.getByText('Approved')).toBeVisible();

  // The second fetch's half: base branch, line counts and the description.
  await expect(header.getByText(/wants to merge feature\/reviews into main/)).toBeVisible();
  await expect(header.getByText('2 files +120 −8')).toBeVisible();
  await expect(header.getByText(/reading a PR should not need a browser/)).toBeVisible();
});

test('the Files tab renders each changed file through the shared DiffView', async ({ page }) => {
  await openPull(
    page,
    withPull({
      pullFiles: {
        '42': {
          files: [
            fileDiff('src/app.tsx', [
              { kind: 'ctx', text: 'const a = 1;' },
              { kind: 'add', text: 'const b = 2;' },
            ]),
            fileDiff('docs/readme.md', [{ kind: 'del', text: 'stale line' }]),
          ],
        },
      },
    }),
  );

  // Files is the tab a PR opens on — the code is what a review is about.
  await expect(page.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');

  await expect(page.getByText('src/app.tsx')).toBeVisible();
  await expect(page.getByText('docs/readme.md')).toBeVisible();
  // Both files are open on arrival: under the three-file default, a small PR
  // must not open showing nothing but filenames.
  await expect(page.getByText('const b = 2;')).toBeVisible();
  await expect(page.getByText('stale line')).toBeVisible();

  // Collapsing unmounts the diff rather than hiding it.
  await page.getByRole('button', { name: /docs\/readme\.md/ }).click();
  await expect(page.getByText('stale line')).toHaveCount(0);
});

test('a capped diff says how much it dropped and offers the forge', async ({ page }) => {
  await openPull(
    page,
    withPull({
      pullFiles: {
        '42': {
          files: [fileDiff('src/app.tsx', [{ kind: 'add', text: 'one' }])],
          truncated: true,
          omittedFiles: 37,
          totalBytes: 4 * 1024 * 1024,
        },
      },
    }),
  );

  // The whole point of the truncation contract: a short answer that says so.
  await expect(page.getByText(/37 more files are not shown/)).toBeVisible();
  await page.getByRole('button', { name: 'Open the whole diff on GitHub' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __mgitExternalUrls: string[] }).__mgitExternalUrls,
      ),
    )
    .toContain('https://github.com/bilo-io/midnite-git/pull/42');
});

test('Conversation interleaves discussion and review verdicts', async ({ page }) => {
  await openPull(
    page,
    withPull({
      pullComments: {
        '42': [
          {
            id: '1',
            kind: 'comment',
            author: 'reviewer',
            body: 'Should this cache?',
            createdAt: '2026-08-20T10:00:00Z',
            url: '',
            reviewState: null,
          },
          {
            id: '2',
            kind: 'review',
            author: 'maintainer',
            body: 'Reads well now.',
            createdAt: '2026-08-21T10:00:00Z',
            url: '',
            reviewState: 'APPROVED',
          },
        ],
      },
    }),
  );

  await page.getByRole('tab', { name: 'Conversation', exact: true }).click();

  const thread = page.getByRole('list', { name: 'Conversation' });
  await expect(thread.getByText('Should this cache?')).toBeVisible();
  await expect(thread.getByText('Reads well now.')).toBeVisible();
  // A verdict rides the same pill the sidebar row uses.
  await expect(thread.getByText('Approved')).toBeVisible();
});

test('an empty conversation is a sentence, not a blank pane', async ({ page }) => {
  await openPull(page, withPull());
  await page.getByRole('tab', { name: 'Conversation', exact: true }).click();
  await expect(page.getByText('Nobody has commented on this pull request.')).toBeVisible();
});

test('Checks resolves the head sha to a run and shows its job tree', async ({ page }) => {
  await openPull(
    page,
    withPull({
      runs: [run],
      runDetail: {
        '1': {
          jobs: [
            {
              id: '10',
              name: 'typecheck',
              status: 'completed',
              conclusion: 'failure',
              startedAt: '2026-08-26T10:00:10Z',
              completedAt: '2026-08-26T10:01:00Z',
              url: 'https://github.com/bilo-io/midnite-git/actions/runs/1/job/10',
              steps: [],
            },
          ],
        },
      },
      runLogs: { '1': { lines: ['typecheck\tRun tsc\t2026-08-26T10:00:11Z error TS2304'] } },
    }),
  );

  await page.getByRole('tab', { name: /Checks/ }).click();

  // The Actions view's own detail, re-pointed — not a second job renderer.
  await expect(page.getByRole('list', { name: 'Jobs' }).getByText('typecheck')).toBeVisible();
});

test('Checks says so when no cached run matches the head commit', async ({ page }) => {
  // A run on a DIFFERENT sha must not be claimed as this PR's: after a force
  // push the branch's newest run describes a commit the PR no longer points at.
  await openPull(page, withPull({ runs: [{ ...run, headSha: 'b'.repeat(40) }] }));

  await page.getByRole('tab', { name: /Checks/ }).click();
  await expect(
    page.getByText(/No workflow run on feature\/reviews was triggered on aaaaaaa/),
  ).toBeVisible();
});

test('a signed-out gh gets the fix-it hint, not a claim about the pull request', async ({
  page,
}) => {
  /*
    The regression this guards: every tab's empty state is a STATEMENT — "this
    pull request changes no files", "nobody has commented". On a machine with no
    usable `gh` those are confident answers to a question that was never asked.
  */
  await openPull(page, {
    ...base,
    forge: {
      cli: { reason: 'not-authenticated', hint: 'Run `gh auth login` in a terminal.' },
      pulls: [pull],
      pullDetail: { '42': pullDetail },
    },
  });

  await expect(page.getByText('Run `gh auth login` in a terminal.')).toBeVisible();
  await expect(page.getByText('This pull request changes no files.')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Conversation', exact: true }).click();
  await expect(page.getByText('Run `gh auth login` in a terminal.')).toBeVisible();
  await expect(page.getByText('Nobody has commented on this pull request.')).toHaveCount(0);
});
