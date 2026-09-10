import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Inline review threads on a pull request's diff (Phase 20 Theme E).
 *
 * Migrated to `src/features/reviews/review-threads.bridge.test.tsx` (Phase 82
 * Theme C, wave 5) — all 10 of the original tests are ported there, one-for-
 * one. The one test kept here, "an existing thread renders on the line it
 * was written against", is ALSO ported to jsdom for parity, matching the
 * precedent `pr-detail.bridge.test.tsx` set for `review-writes.spec.ts`: the
 * theme's one required browser smoke test per view, proving the assembled
 * diff + thread panel survives a real render, not only jsdom's.
 */

const MAIN = '/tmp/midnite-studio';
const HEAD_SHA = 'a'.repeat(40);

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
  },
];

const pull = {
  number: 42,
  title: 'Reviews page',
  state: 'open',
  isDraft: false,
  reviewDecision: null,
  checks: null,
  headBranch: 'feature/reviews',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-studio/pull/42',
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
      lines: lines.map((row, index) => ({
        kind: row.kind,
        oldNo: row.kind === 'add' ? null : index + 1,
        newNo: row.kind === 'del' ? null : index + 1,
        text: row.text,
        ranges: [],
        noNewline: false,
      })),
    },
  ],
  insertions: lines.filter((row) => row.kind === 'add').length,
  deletions: lines.filter((row) => row.kind === 'del').length,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

/** A `ForgeReviewThread`, already grouped — see the fixture's own note. */
const thread = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'PRRT_one',
  path: 'src/app.tsx',
  line: 2,
  originalLine: 2,
  startLine: null,
  side: 'RIGHT',
  resolved: false,
  outdated: false,
  fileLevel: false,
  comments: [
    {
      id: 'PRRC_one',
      databaseId: '1234',
      author: 'ana',
      body: 'This reads better as a guard clause.',
      createdAt: '2026-08-26T09:00:00Z',
      url: '',
    },
  ],
  ...over,
});

const THREE_LINES = fileDiff('src/app.tsx', [
  { kind: 'ctx', text: 'const a = 1;' },
  { kind: 'add', text: 'const b = 2;' },
  { kind: 'del', text: 'const c = 3;' },
]);

const base: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
};

const withThreads = (
  threads: Record<string, unknown>[],
  over: Partial<NonNullable<MockFixtures['forge']>> = {},
): MockFixtures => ({
  ...base,
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    pullDetail: { '42': { headSha: HEAD_SHA, baseBranch: 'main', changedFiles: 1 } },
    pullFiles: { '42': { files: [THREE_LINES] } },
    pullThreads: { '42': threads },
    ...over,
  },
});

/** Open the app, expand Reviews, and click into PR #42's Files tab. */
async function openFiles(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  // The section is a heading over three lazy scopes now — the rows live under
  // one of them, and nothing is fetched until that one is opened.
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await page.getByText('Reviews page', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pull request #42' })).toBeVisible();

  /*
    A PR opens on Overview — `PrDetail` picks the tab that answers "what is
    this?" before "what changed?". Threads live on the diff, so this helper is
    not done until Files is the tab on screen.
  */
  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByText('const b = 2;')).toBeVisible();
}

test('an existing thread renders on the line it was written against', async ({ page }) => {
  await openFiles(page, withThreads([thread()]));

  const panel = page.getByTestId('comment-thread');
  await expect(panel).toBeVisible();
  // The anchor, asserted as the anchor rather than as "somewhere on the page":
  // a thread on the wrong line looks identical to one on the right line.
  await expect(panel).toHaveAttribute('data-line', '2');
  // Scoped to the comment list: the author's name also appears in the thread's
  // own summary row, and an unscoped match resolves to both.
  await expect(panel.getByRole('list', { name: 'Thread comments' }).getByText('ana')).toBeVisible();
  await expect(panel.getByText('This reads better as a guard clause.')).toBeVisible();
});
