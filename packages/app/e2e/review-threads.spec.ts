import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Inline review threads on a pull request's diff (Phase 20 Theme E).
 *
 * The grouping, the anchor mapping and `gh-write.ts`'s command construction are
 * covered under bare vitest, where they belong. What only the assembled app can
 * show is the part the theme exists for: that a thread renders *between the diff
 * rows it is about*, that the gutter on a line opens a composer for that line,
 * and that a posted comment actually comes back — which is the invalidation, and
 * a `ok: true` that changed nothing would otherwise pass.
 */

const MAIN = '/tmp/midnite-git';
const HEAD_SHA = 'a'.repeat(40);

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
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
  url: 'https://github.com/bilo-io/midnite-git/pull/42',
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

const writes = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __mgitWrites?: unknown[] }).__mgitWrites ?? [],
  );

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

test('a resolved thread arrives collapsed, and says so', async ({ page }) => {
  await openFiles(page, withThreads([thread({ resolved: true })]));

  const panel = page.getByTestId('comment-thread');
  /*
    `getByRole('img', …)`, not `getByText`: a settled status renders as a bare
    coloured glyph now, so its word survives only as the mark's accessible
    name. Asserting on the name rather than on visible text is also the stronger
    check — it fails if the pill loses the label a screen reader needs.
  */
  await expect(panel.getByRole('img', { name: 'Resolved', exact: true })).toBeVisible();
  // Collapsed, not hidden: the summary counts it and one click opens it.
  await expect(panel.getByText('This reads better as a guard clause.')).toHaveCount(0);
  await panel.getByRole('button', { name: /ana/ }).click();
  await expect(panel.getByText('This reads better as a guard clause.')).toBeVisible();
});

test('the gutter opens a composer on the line that was clicked, and posts it', async ({ page }) => {
  await openFiles(page, withThreads([]));

  // Line 2 is the added line — right-side, so commentable.
  await page.getByRole('button', { name: 'Comment on line 2' }).click();
  const composer = page.getByTestId('comment-composer');
  await expect(composer).toBeVisible();

  await composer.getByRole('textbox').fill('Why not a guard clause?');
  await composer.getByRole('button', { name: 'Add comment' }).click();

  // The write, with the anchor it was actually sent with — invisible in the
  // rendered result, and the whole thing that could be silently wrong.
  await expect
    .poll(() => writes(page))
    .toMatchObject([
      {
        channel: 'reviewComment',
        request: {
          number: 42,
          path: 'src/app.tsx',
          line: 2,
          side: 'RIGHT',
          commitId: HEAD_SHA,
          // Line 1 (ctx), line 2 (add) → position 2. The fallback anchor rides
          // along even though the line-based one is what main tries first.
          position: 2,
          body: 'Why not a guard clause?',
        },
      },
    ]);

  // And it comes back: the mutation invalidated the thread key and the refetch
  // is different. A stubbed write that answered `ok` would fail here.
  await expect(page.getByTestId('comment-thread')).toBeVisible();
  await expect(page.getByText('Why not a guard clause?')).toBeVisible();
});

test('a deleted line offers no comment affordance', async ({ page }) => {
  await openFiles(page, withThreads([]));

  // v1 anchors only to the right side; line 3 is the `-` row.
  await expect(page.getByRole('button', { name: 'Comment on line 3' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Comment on line 1' })).toBeVisible();
});

test('replying posts to the last comment in the thread and appears in it', async ({ page }) => {
  await openFiles(page, withThreads([thread()]));

  const panel = page.getByTestId('comment-thread');
  await panel.getByRole('button', { name: 'Reply' }).click();
  await panel.getByRole('textbox').fill('Agreed.');
  await panel.getByRole('button', { name: 'Reply' }).click();

  await expect
    .poll(() => writes(page))
    .toMatchObject([
      { channel: 'reviewReply', request: { number: 42, commentId: '1234', body: 'Agreed.' } },
    ]);
  await expect(page.getByText('Agreed.')).toBeVisible();
});

test('resolving flips the thread, and the panel reads back resolved', async ({ page }) => {
  await openFiles(page, withThreads([thread()]));

  const panel = page.getByTestId('comment-thread');
  await panel.getByRole('button', { name: 'Resolve' }).click();

  await expect
    .poll(() => writes(page))
    .toMatchObject([
      { channel: 'resolveThread', request: { threadId: 'PRRT_one', resolved: true } },
    ]);
  await expect(panel.getByRole('img', { name: 'Resolved', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Reopen' })).toBeVisible();
});

test("a refused write says what gh said, and keeps the reader's text", async ({ page }) => {
  await openFiles(
    page,
    withThreads([], { writeError: 'You must have write access to this repository' }),
  );

  await page.getByRole('button', { name: 'Comment on line 2' }).click();
  const composer = page.getByTestId('comment-composer');
  await composer.getByRole('textbox').fill('A comment nobody can post');
  await composer.getByRole('button', { name: 'Add comment' }).click();

  // `gh`'s own sentence, beside the line it was refused on — not a toast that
  // has already faded by the time the reader looks up.
  await expect(page.getByText('You must have write access to this repository')).toBeVisible();
});

test('an outdated thread is grouped above the diff, never pinned to a live line', async ({
  page,
}) => {
  await openFiles(
    page,
    withThreads([thread({ id: 'PRRT_old', outdated: true, line: null, originalLine: 40 })]),
  );

  // Not on line 2 — and not on any line. That is the point of the group: a
  // thread whose anchor was rewritten away must not be attributed to whichever
  // row carries that number now.
  await expect(page.getByTestId('comment-thread')).toHaveCount(0);

  const group = page.getByTestId('outdated-threads');
  await expect(group).toBeVisible();
  await expect(group.getByText('1 comment thread no longer in this diff')).toBeVisible();

  await group.getByRole('button', { name: /no longer in this diff/ }).click();
  await expect(group.getByText('Was on line 40 — no longer in the diff')).toBeVisible();
  await expect(group.getByText('This reads better as a guard clause.')).toBeVisible();
});

test('a file-level thread reports itself as being on the file, not a line', async ({ page }) => {
  await openFiles(
    page,
    withThreads([thread({ id: 'PRRT_file', fileLevel: true, line: null, originalLine: null })]),
  );

  const group = page.getByTestId('outdated-threads');
  await group.getByRole('button', { name: /no longer in this diff/ }).click();
  await expect(group.getByText('On the file, not a line')).toBeVisible();
});

test('the Changes page diff grows no comment gutter', async ({ page }) => {
  // `DiffView` is shared by three surfaces and only one of them has review
  // threads. The gate is `threads`/`onComment` being absent, and this is the
  // assertion that the gate holds — a working-tree diff must never offer to
  // post a pull-request comment.
  await installMockBridge(page, {
    ...fixtures,
    remotes: REMOTES,
  });
  await page.goto('/');

  await page.getByText('feat(phase-11): package, install and run from /Applications').click();
  await page.getByRole('button', { name: /window\.ts/ }).click();
  await expect(page.getByTestId('diff-view')).toBeVisible();

  await expect(page.getByRole('button', { name: /^Comment on line/ })).toHaveCount(0);
});
