import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The sidebar as a workbench — counts, the Changes filter, the menus, and the
 * whole-checkout diff.
 *
 * These are the parts that only the assembled app can demonstrate. The unit
 * tests already cover the reducers underneath (which tab takes focus, what the
 * expand-all cap withholds, how a CI verdict maps to a colour); what none of
 * them can show is that a count rendered against the RIGHT checkout, or that
 * filtering the tree left the dirty worktree visible and took the clean one
 * away.
 */

const MAIN = '/tmp/midnite-git';
const FEATURE = '/tmp/midnite-git-feature';

const entry = (path: string, unstaged = 'modified') => ({
  path,
  origPath: null,
  staged: 'unmodified',
  unstaged,
  conflicted: false,
  similarity: null,
});

const localRef = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

/**
 * A minimal one-hunk diff.
 *
 * The mock falls back to a well-formed EMPTY `FileDiff` for any path it has no
 * fixture for, and an empty diff legitimately renders the "nothing to show"
 * card rather than the diff view — so a spec asserting that expanding a file
 * shows a diff has to supply one that actually has content.
 */
const diffFor = (path: string) => ({
  path,
  oldPath: path,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      heading: `@@ -1,2 +1,2 @@`,
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      lines: [
        { kind: 'del', oldNo: 1, newNo: null, text: 'const a = 1;', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 1, text: 'const a = 2;', ranges: [], noNewline: false },
        {
          kind: 'ctx',
          oldNo: 2,
          newNo: 2,
          text: 'export default a;',
          ranges: [],
          noNewline: false,
        },
      ],
    },
  ],
  insertions: 1,
  deletions: 1,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

const REMOTES = [
  {
    name: 'origin',
    fetchUrl: 'git@github.com:bilo-io/midnite-git.git',
    pushUrl: 'git@github.com:bilo-io/midnite-git.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-git', kind: 'github' },
  },
];

/**
 * Two checkouts that disagree: main is clean, the feature worktree has three
 * changed files. Every assertion below depends on that asymmetry — a fixture
 * where both are dirty could not tell a correct count from a broadcast one.
 */
const base: MockFixtures = {
  ...fixtures,
  refs: [
    localRef('main', { isHead: true, worktreePath: MAIN }),
    localRef('feature/x', { worktreePath: FEATURE }),
    localRef('shelved'),
  ],
  remotes: REMOTES,
  diffs: {
    ...fixtures.diffs,
    'wt:src/a.ts': diffFor('src/a.ts'),
    'wt:src/b.ts': diffFor('src/b.ts'),
    'wt:README.md': diffFor('README.md'),
  },
  worktrees: [{ path: FEATURE, branch: 'feature/x' }],
  statusEntries: [],
  statusByWorktree: {
    [MAIN]: [],
    [FEATURE]: [entry('src/a.ts'), entry('src/b.ts'), entry('README.md', 'untracked')],
  },
  // Deliberately uneven, so the header's total can only be a real sum:
  // 1+20+300 = 321 in, 1+2+0 = 3 out.
  statusCounts: {
    'unstaged:src/a.ts': { insertions: 1, deletions: 1 },
    'unstaged:src/b.ts': { insertions: 20, deletions: 2 },
    'unstaged:README.md': { insertions: 300, deletions: 0 },
  },
};

async function open(page: Page, data: MockFixtures = base): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
}

const goToChanges = (page: Page) => page.getByRole('link', { name: 'Changes' }).click();

test('a change count lands on the checkout that owns it, not the repo', async ({ page }) => {
  await open(page);

  // Exactly one pill: the feature worktree's. The clean main checkout shows
  // nothing rather than a zero, and the count must not be broadcast to every
  // row from the primary checkout's status.
  const pills = page.getByTestId('change-count');
  await expect(pills).toHaveCount(2); // the worktree row and its branch row
  await expect(pills.first()).toHaveText('3');

  // The branch row for a checkout that IS clean stays bare.
  const mainRow = page.locator('div').filter({ hasText: /^main/ }).first();
  await expect(mainRow.getByTestId('change-count')).toHaveCount(0);
});

test('the Changes view hides the checkouts with nothing in them', async ({ page }) => {
  await open(page);

  await expect(page.getByRole('heading', { name: 'Local' })).toBeVisible();

  await goToChanges(page);

  // Ref sections go entirely: they answer a question the Changes view is not
  // asking, and leaving them would mean the filter dropped repositories while
  // keeping two hundred tags.
  await expect(page.getByRole('heading', { name: 'Local' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  // The dirty checkout survives; the clean one does not.
  await expect(page.getByRole('button', { name: /Actions for worktree feature\/x/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for worktree main' })).toHaveCount(0);
});

test('the filter is visible while on, and reversible', async ({ page }) => {
  await open(page);
  await goToChanges(page);

  const toggle = page.getByRole('button', { name: 'Showing only changed checkouts' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  await toggle.click();

  // Putting it back restores the whole tree — a mode that eats rows with no way
  // out is indistinguishable from data loss.
  await expect(page.getByRole('heading', { name: 'Local' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actions for worktree main' })).toBeVisible();
});

test('a worktree offers its actions on right-click and on hover', async ({ page }) => {
  await open(page);

  const row = page.getByRole('button', { name: 'Actions for worktree feature/x' });
  await row.click();
  await expect(page.getByRole('menuitem', { name: 'View all changes' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Remove worktree feature\/x/ })).toBeVisible();

  await page.keyboard.press('Escape');

  // The same menu from the same row, reached the other way. A context menu on
  // its own is an affordance nobody finds; a hover button on its own is not
  // discoverable by right-clickers.
  await page.getByText('feature/x').first().click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'View all changes' })).toBeVisible();
});

test('removing a worktree asks first, in danger colours, naming what is at stake', async ({
  page,
}) => {
  await open(page);

  await page.getByRole('button', { name: 'Actions for worktree feature/x' }).click();
  await page.getByRole('menuitem', { name: /Remove worktree feature\/x/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The number is the whole point of the dialog: "are you sure" asks the user
  // to re-derive what the app already knows.
  await expect(dialog).toContainText('3 uncommitted changes in this checkout would be lost.');
  await expect(dialog.getByRole('button', { name: 'Remove worktree' })).toBeVisible();

  // Cancel is what a stray Return hits.
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
});

test('the main worktree cannot be removed', async ({ page }) => {
  await open(page);

  await page.getByRole('button', { name: 'Actions for worktree main' }).click();
  // Disabled with a reason, not absent: the action exists for other worktrees,
  // so silence here would read as a missing feature rather than a rule.
  const item = page.getByRole('menuitem', { name: /Remove worktree/ });
  await expect(item).toBeDisabled();
});

test('View all changes opens a tab of per-file accordions', async ({ page }) => {
  await open(page);

  await page
    .getByRole('button', { name: 'View all changes in worktree feature/x' })
    .first()
    .click();

  // Opening the tab has to switch to the view that hosts it, or the click
  // appears to do nothing at all.
  await expect(page.getByRole('tab', { name: 'feature/x' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId('change-totals')).toContainText('3 files');

  // Closed accordions render no diff — that is the whole performance story of
  // this view, and a spec that never checks it would not notice it regressing.
  await expect(page.getByTestId('diff-view')).toHaveCount(0);

  await page.getByRole('button', { name: /a\.ts/ }).click();
  await expect(page.getByTestId('diff-view')).toHaveCount(1);

  await page.getByRole('button', { name: 'Expand all files' }).click();
  await expect(page.getByTestId('diff-view')).toHaveCount(3);

  await page.getByRole('button', { name: 'Collapse all files' }).click();
  await expect(page.getByTestId('diff-view')).toHaveCount(0);
});

test('the all-changes tab totals the checkout without expanding anything', async ({ page }) => {
  await open(page);

  await page
    .getByRole('button', { name: 'View all changes in worktree feature/x' })
    .first()
    .click();

  // The point of the header total: it is a real sum over all three files while
  // every one of them is still closed and no `git diff` has run.
  const totals = page.getByTestId('change-totals');
  await expect(totals).toContainText('3 files');
  await expect(totals).toContainText('+321');
  await expect(totals).toContainText('−3');
  await expect(page.getByTestId('diff-view')).toHaveCount(0);

  // And each closed row carries its own pair — the whole reason the counts come
  // from the view's numstat rather than from the diff the body would fetch.
  await expect(page.getByRole('button', { name: /README\.md/ })).toContainText('+300');
});

test('the all-changes tab carries its own totals in the tab bar', async ({ page }) => {
  await open(page);

  await page
    .getByRole('button', { name: 'View all changes in worktree feature/x' })
    .first()
    .click();

  // Ahead of the close button, so it reads before the "X" rather than after it.
  const tab = page.getByRole('tab', { name: 'feature/x' }).locator('..');
  await expect(tab).toContainText('3');
  await expect(tab).toContainText('+321');
  await expect(tab).toContainText('−3');

  const closeButton = page.getByRole('button', { name: 'Close feature/x' });
  const statsBox = (await tab.getByText('+321').boundingBox())!;
  const closeBox = (await closeButton.boundingBox())!;
  expect(statsBox.x).toBeLessThan(closeBox.x);
});

test('the working-tree tab cannot be closed', async ({ page }) => {
  await open(page);
  await page
    .getByRole('button', { name: 'View all changes in worktree feature/x' })
    .first()
    .click();

  await expect(page.getByRole('button', { name: 'Close feature/x' })).toBeVisible();
  // A strip you can empty to nothing is a view with no content.
  await expect(
    page.getByRole('button', { name: /^Close (Working tree|midnite-git)$/ }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Close feature/x' }).click();
  await expect(page.getByRole('tab', { name: 'feature/x' })).toHaveCount(0);
});

test('Actions and Reviews list what gh reports, and open on GitHub', async ({ page }) => {
  await open(page, {
    ...base,
    forge: {
      cli: { reason: 'ready' },
      runs: [
        {
          id: '1',
          name: 'CI',
          status: 'completed',
          conclusion: 'failure',
          headBranch: 'feature/x',
          headSha: 'a'.repeat(40),
          createdAt: '2026-08-26T10:00:00Z',
          url: 'https://github.com/bilo-io/midnite-git/actions/runs/1',
        },
      ],
      pulls: [
        {
          number: 42,
          title: 'Line the table up',
          state: 'open',
          isDraft: false,
          reviewDecision: 'APPROVED',
          checks: 'failing',
          headBranch: 'feature/x',
          author: 'bilo',
          url: 'https://github.com/bilo-io/midnite-git/pull/42',
        },
      ],
    },
  });

  // Both sections start CLOSED and issue no query until opened: each one is a
  // `gh` subprocess and an API request against the user's rate limit.
  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  await expect(page.getByText('Failed')).toBeVisible();

  await page.getByRole('button', { name: 'Reviews', exact: true }).click();
  await expect(page.getByText('Line the table up')).toBeVisible();
  // Draft/approval and the checks rollup are separate readings, both shown.
  await expect(page.getByText('Approved')).toBeVisible();
  await expect(page.getByText('Checks failing')).toBeVisible();

  await page.getByText('Line the table up').click();
  await expect(page.getByRole('tab', { name: /#42 Line the table up/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await page.getByRole('button', { name: 'Open #42 on GitHub' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __mgitExternalUrls: string[] }).__mgitExternalUrls,
      ),
    )
    .toContain('https://github.com/bilo-io/midnite-git/pull/42');
});

test('a signed-out gh says what to run rather than failing silently', async ({ page }) => {
  await open(page, {
    ...base,
    forge: {
      cli: { reason: 'not-authenticated', hint: 'Run `gh auth login` in a terminal.' },
    },
  });

  await page.getByRole('button', { name: 'Actions', exact: true }).click();
  // The one empty state the user can actually fix — so it must not look like
  // "this repository has no CI".
  await expect(page.getByText('Run `gh auth login` in a terminal.')).toBeVisible();
});

test('a repo with no GitHub remote grows no forge sections at all', async ({ page }) => {
  await open(page, { ...base, remotes: [] });

  // Absent, not empty: `gh` speaks GitHub only, so there is nothing here that
  // could ever load. A permanently empty section is not a section.
  await expect(page.getByRole('heading', { name: 'Actions' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Reviews' })).toHaveCount(0);
});

test('the section headings share one height, whether or not they carry an action', async ({
  page,
}) => {
  await open(page);

  /*
    Only some headings have a trailing ellipsis — Tags earns one past the
    preview cap, Actions and Reviews only once open — and that control is an
    `h-6` button. While the row was padded rather than sized, its presence made
    the row taller, so the sidebar's section rhythm stuttered from repo to repo
    depending on which sections happened to have a menu.
  */
  const heights = await Promise.all(
    // Local and Worktrees carry an ellipsis here; Actions and Reviews, closed,
    // carry nothing. That is the pair the row height used to disagree about.
    ['Local', 'Worktrees', 'Actions', 'Reviews'].map(async (title) => {
      const header = page
        .getByRole('heading', { name: title, exact: true })
        .first()
        .locator('xpath=ancestor::header[1]');
      return Math.round((await header.boundingBox())?.height ?? -1);
    }),
  );

  expect(new Set(heights).size).toBe(1);
  expect(heights[0]).toBeGreaterThan(0);
});

test('a folded repo hangs its branch and count off the trailing edge', async ({ page }) => {
  await open(page);

  await page.locator('button[aria-label="Collapse midnite-git"]').click();
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toHaveCount(0);

  /*
    Folded rows are read as a column, so the summary has to line up down the
    panel rather than start wherever each repository's name happens to end —
    and it belongs beside the sync control it explains, not beside the name.
  */
  const row = page.locator('div.group').filter({ has: page.getByTestId('change-count') }).first();
  const pill = (await row.getByTestId('change-count').boundingBox())!;
  const sync = (await row.getByRole('button', { name: /^Fetch —/ }).boundingBox())!;
  const box = (await row.boundingBox())!;

  expect(pill.x + pill.width).toBeLessThanOrEqual(sync.x);
  expect(pill.x).toBeGreaterThan(box.x + box.width / 2);
});
