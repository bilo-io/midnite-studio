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
  url: 'https://github.com/bilo-io/midnite-studio/actions/runs/1',
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

/**
 * Click the PR row, from the middle of the viewport.
 *
 * Playwright's auto-scroll brings a row to the *top* of its scroll container,
 * which is exactly where the sticky "All Pull Requests" section header sits —
 * so the click is intercepted by the header, retried, re-scrolled to the same
 * place, and intercepted again until the test times out. It is a scroll-position
 * artifact rather than a product fault (a real user scrolls the row clear before
 * reaching for it), but it made this file fail roughly one run in three, which
 * is intolerable now that CI blocks on it. Centring the row first puts it well
 * clear of the header.
 */
async function openPullRow(page: Page): Promise<void> {
  const row = page.getByText('Reviews page', { exact: true });
  await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await row.click();
}

/** Open the app, expand Reviews, and click into PR #42. */
async function openPull(page: Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  // The section is a heading over three lazy scopes now — the rows live under
  // one of them, and nothing is fetched until that one is opened.
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await openPullRow(page);
  await expect(page.getByRole('region', { name: 'Pull request #42' })).toBeVisible();

  /*
    A PR opens on Overview, not on Files — see `PrDetail`'s own note: the first
    question a PR answers is "what is this?", and the description used to sit in
    the header. Every spec below is about a tab's contents, so the helper puts
    the tab it is about on screen. The landing tab itself is asserted once, by
    the test directly under this helper, so a future change to that default
    fails one test that names the decision instead of all of them.
  */
  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByRole('tab', { name: 'Files' })).toHaveAttribute('aria-selected', 'true');
}

test('a pull request opens on Overview, showing what it is before what changed', async ({
  page,
}) => {
  await installMockBridge(page, withPull());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await page.getByRole('button', { name: 'All Pull Requests', exact: true }).click();
  await openPullRow(page);

  await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // The description the header used to carry is this tab's whole content.
  await expect(
    page
      .getByRole('tabpanel', { name: 'Overview' })
      .getByText(/reading a PR should not need a browser/),
  ).toBeVisible();
});

test('the PR header reads from the listing, then fills in from the detail fetch', async ({
  page,
}) => {
  await openPull(page, withPull());

  const header = page.getByRole('region', { name: 'Pull request #42' });
  await expect(header.getByRole('heading', { name: /#42 Reviews page/ })).toBeVisible();
  /*
    `getByRole('img', …)`, not `getByText`: a settled status renders as a bare
    coloured glyph now, so its word survives only as the mark's accessible
    name. Asserting on the name rather than on visible text is also the stronger
    check — it fails if the pill loses the label a screen reader needs.
  */
  await expect(header.getByRole('img', { name: 'Approved', exact: true })).toBeVisible();

  /*
    The second fetch's half: base branch and line counts. The description is
    the third thing that fetch brings back, but it is no longer part of the
    header — it is the Overview tab's whole content — so it is asserted by the
    landing-tab test above rather than here.
  */
  await expect(header.getByText(/wants to merge feature\/reviews into main/)).toBeVisible();
  await expect(header.getByText('2 files +120 −8')).toBeVisible();
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
        () => (window as unknown as { __mstudioExternalUrls: string[] }).__mstudioExternalUrls,
      ),
    )
    .toContain('https://github.com/bilo-io/midnite-studio/pull/42');
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
  await expect(thread.getByRole('img', { name: 'Approved', exact: true })).toBeVisible();
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
              url: 'https://github.com/bilo-io/midnite-studio/actions/runs/1/job/10',
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

  /*
    Scoped to the PR detail region: the sidebar's own Reviews section and the
    Reviews view's list pane (Phase 20 A/B) carry the identical CLI hint text,
    each independently reporting the same "gh is signed out" — this test is
    about the DETAIL's own per-tab reporting specifically.
  */
  const detail = page.getByRole('region', { name: /^Pull request #42/ });

  await expect(detail.getByText('Run `gh auth login` in a terminal.')).toBeVisible();
  await expect(detail.getByText('This pull request changes no files.')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Conversation', exact: true }).click();
  await expect(detail.getByText('Run `gh auth login` in a terminal.')).toBeVisible();
  await expect(detail.getByText('Nobody has commented on this pull request.')).toHaveCount(0);
});

/**
 * A tall detail pane must never be drawn over the terminal.
 *
 * The Checks tab is the worst case in the app: a PR header sized by its
 * description, a job tree and a log pane, three of whose four chrome rows
 * refuse to shrink. Squeeze the column — a short window with the terminal
 * open — and the surplus used to spill straight out of the view and across the
 * terminal's own header, because nothing between them clipped and CSS paints an
 * earlier sibling's TEXT after a later sibling's BACKGROUND.
 *
 * Hit-testing across the strip is the honest assertion. `toBeVisible()` would
 * pass on a header buried under another pane's rows, and a bounding-box check
 * would pass on content that is clipped but still laid out where it was.
 */
test(
  'the terminal header is never painted over by a squeezed detail pane',
  // Tagged, not ignored: this is the only spec in the file that mounts a
  // terminal, and terminals do not render on the CI runner (see the
  // `@linux-red` note in playwright.ci.config.ts). A file-level ignore would
  // cost the other nine specs here their place in the blocking job.
  { tag: '@linux-red' },
  async ({ page }) => {
    // Short enough that the 288px terminal leaves the Checks tab less room than
    // its own chrome needs — the condition, not an incidental viewport.
    await page.setViewportSize({ width: 1280, height: 620 });

    await openPull(
      page,
      withPull({
        pullDetail: {
          '42': {
            ...pullDetail,
            // A description long enough to hit the header's own `max-h-40` cap,
            // which is what leaves the tab panel short.
            body: Array.from(
              { length: 40 },
              (_, at) => `Paragraph ${at + 1} of the description.`,
            ).join('\n\n'),
          },
        },
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
                url: 'https://github.com/bilo-io/midnite-studio/actions/runs/1/job/10',
                steps: [],
              },
            ],
          },
        },
        runLogs: {
          '1': {
            lines: Array.from(
              { length: 200 },
              (_, at) => `typecheck\tRun tsc\t2026-08-26T10:00:11Z line ${at + 1}`,
            ),
          },
        },
      }),
    );

    await page.getByRole('tab', { name: /Checks/ }).click();
    await expect(page.getByRole('list', { name: 'Jobs' }).getByText('typecheck')).toBeVisible();

    await page.keyboard.press('Control+`');
    const header = page.locator('[data-terminal-header]');
    await expect(header).toBeVisible();

    const box = await header.boundingBox();
    expect(box).not.toBeNull();

    /*
    Sampled across the whole width rather than at one point: the spill lands
    over the detail pane's own columns on the right, and a single probe near
    the label on the left would have passed throughout the bug.
  */
    const probes = Array.from({ length: 24 }, (_, at) => ({
      x: box!.x + ((at + 0.5) * box!.width) / 24,
      y: box!.y + box!.height / 2,
    }));

    const strays = await page.evaluate(
      (points) =>
        points
          .map(({ x, y }) => {
            const hit = document.elementFromPoint(x, y);
            if (hit?.closest('[data-terminal-panel]')) return null;
            return {
              x: Math.round(x),
              tag: hit?.tagName ?? 'none',
              text: hit?.textContent?.slice(0, 40) ?? '',
            };
          })
          .filter((entry) => entry !== null),
      probes,
    );

    expect(strays).toEqual([]);
  },
);
