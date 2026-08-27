import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The committed screenshots for Phase 20 Theme E.
 *
 * A spec rather than a one-off script, following `reviews-shots.spec.ts`, so the
 * images can be regenerated when the panel changes instead of going quietly
 * stale — and so the fixture that produced them is reviewable beside them.
 */

/* Playwright runs with `packages/app` as its cwd. */
const OUT = '../../docs/screenshots/phase-20-inline-threads';

/*
  Wider than the suite's default 1280.

  The Reviews view is three panes — rail, PR list, detail — and at 1280 the
  thread panel's own Resolve control lands past the right edge, so the image
  would show the feature with half its affordances cut off. This is a screenshot
  size, not a supported-minimum claim.
*/
test.use({ viewport: { width: 1680, height: 1000 } });

const HEAD_SHA = 'c0ffee'.padEnd(40, '0');

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
  },
];

const pull = {
  number: 131,
  title: 'Inline review threads on the diff',
  state: 'open',
  isDraft: false,
  reviewDecision: 'CHANGES_REQUESTED',
  checks: 'passing',
  headBranch: 'feature/phase-20-inline-threads',
  author: 'bilo',
  url: 'https://github.com/bilo-io/midnite-git/pull/131',
};

const line = (
  kind: 'add' | 'del' | 'ctx',
  text: string,
  oldNo: number | null,
  newNo: number | null,
): Record<string, unknown> => ({ kind, oldNo, newNo, text, ranges: [], noNewline: false });

/** The real `comment-anchors.ts`, shown as the diff being reviewed. */
const ANCHORS = {
  path: 'packages/app/src/features/diff/comment-anchors.ts',
  oldPath: null,
  change: 'added',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: 12,
      heading: 'export function positionForLine',
      lines: [
        line('ctx', 'export function positionForLine(diff: FileDiff, newNo: number): number | null {', 1, 1),
        line('add', '  let position = 0;', null, 2),
        line('add', '', null, 3),
        line('add', '  for (const [hunkIndex, hunk] of diff.hunks.entries()) {', null, 4),
        line('add', '    // Every hunk header but the first is itself a counted line.', null, 5),
        line('add', '    if (hunkIndex > 0) position += 1;', null, 6),
        line('add', '', null, 7),
        line('add', '    for (const line of hunk.lines) {', null, 8),
        line('add', '      position += 1;', null, 9),
        line('add', "      if (line.kind !== 'del' && line.newNo === newNo) return position;", null, 10),
        line('add', '    }', null, 11),
        line('add', '  }', null, 12),
      ],
    },
  ],
  insertions: 11,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
};

const comment = (
  id: string,
  author: string,
  body: string,
  createdAt: string,
): Record<string, unknown> => ({
  id,
  databaseId: id.replace(/\D/g, '') || '1',
  author,
  body,
  createdAt,
  url: '',
});

const data: MockFixtures = {
  ...fixtures,
  remotes: REMOTES,
  statusEntries: [],
  statusByWorktree: { '/tmp/midnite-git': [] },
  forge: {
    cli: { reason: 'ready' },
    pulls: [pull],
    pullDetail: {
      '131': {
        body: 'A review comment belongs next to the line it is about. This puts the thread between the diff rows, and lets you reply and resolve without leaving the app.',
        headSha: HEAD_SHA,
        baseBranch: 'main',
        additions: 742,
        deletions: 18,
        changedFiles: 14,
        mergeable: 'MERGEABLE',
      },
    },
    pullFiles: { '131': { files: [ANCHORS] } },
    pullThreads: {
      '131': [
        {
          id: 'PRRT_position',
          path: ANCHORS.path,
          line: 6,
          originalLine: 6,
          startLine: null,
          side: 'RIGHT',
          resolved: false,
          outdated: false,
          fileLevel: false,
          comments: [
            comment(
              'PRRC_11',
              'ana',
              'Worth stating *why* only the first header is the origin — this is the clause everyone gets wrong.',
              '2026-08-27T10:04:00Z',
            ),
            comment(
              'PRRC_12',
              'bilo',
              'Added, along with the two other clauses: later `@@` headers count, and so do deleted lines.',
              '2026-08-27T10:19:00Z',
            ),
          ],
        },
        {
          id: 'PRRT_deleted',
          path: ANCHORS.path,
          line: 10,
          originalLine: 10,
          startLine: null,
          side: 'RIGHT',
          resolved: true,
          outdated: false,
          fileLevel: false,
          comments: [
            comment(
              'PRRC_21',
              'maintainer',
              'Does a `del` line with a matching `oldNo` fall through here?',
              '2026-08-27T10:26:00Z',
            ),
          ],
        },
        {
          id: 'PRRT_gone',
          path: ANCHORS.path,
          line: null,
          originalLine: 40,
          startLine: null,
          side: 'RIGHT',
          resolved: false,
          outdated: true,
          fileLevel: false,
          comments: [
            comment(
              'PRRC_31',
              'ana',
              'This branch went away when the mapping moved out of the component.',
              '2026-08-26T16:40:00Z',
            ),
          ],
        },
      ],
    },
  },
};

async function openThreads(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  /*
    The nav-rail item is a LINK, and `getByRole('button', {name: 'Reviews'})`
    matches the sidebar's Reviews *section header* instead — which expands the
    section without leaving the Graph view, and leaves the PR's title clipped
    behind its two badges. Going through the rail puts the whole Reviews view on
    screen, which is what these images are of.
  */
  await page.getByRole('link', { name: 'Reviews' }).click();

  /*
    The three scopes arrive folded and fetch nothing until one is opened, so the
    list is empty on arrival and there is nothing for the view to select. Open
    All Pull Requests and the auto-select still does the rest: with one pull
    request loaded the view marks it `aria-current="true"` without a click on
    the row. Scoped through `reviews-groups`: the repositories sidebar carries
    the same three headings and is on screen too, which is what that testid
    exists for.
  */
  await page
    .getByTestId('reviews-groups')
    .getByRole('button', { name: 'All Pull Requests', exact: true })
    .click();
  await expect(page.getByRole('region', { name: 'Pull request #131' })).toBeVisible();

  // Threads hang off the diff, and a PR opens on Overview.
  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByTestId('comment-thread').first()).toBeVisible();

  /*
    Park the pointer off the rail before shooting.

    Clicking the rail leaves the cursor on it, and the rail expands on hover —
    which in the default `navMode` overlays the repositories sidebar. Every
    image would show the app mid-gesture rather than at rest.
  */
  await page.mouse.move(1200, 950);

  // Highlighting lands through requestIdleCallback — give it the frame it wants
  // so the committed image shows the diff as a reader actually sees it.
  await page.waitForTimeout(900);
}

test('threads light', async ({ page }) => {
  await openThreads(page);
  await page.screenshot({ path: `${OUT}/threads-light.png` });
});

test('threads dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openThreads(page);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/threads-dark.png` });
});

test('composer open on a line', async ({ page }) => {
  await openThreads(page);
  await page.getByRole('button', { name: 'Comment on line 9' }).click();
  await expect(page.getByTestId('comment-composer')).toBeVisible();
  await page
    .getByTestId('comment-composer')
    .getByRole('textbox')
    .fill('Could this loop early-exit once `position` passes the last hunk?');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/composer.png` });
});

test('outdated group expanded', async ({ page }) => {
  await openThreads(page);
  await page.getByRole('button', { name: /no longer in this diff/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/outdated.png` });
});
