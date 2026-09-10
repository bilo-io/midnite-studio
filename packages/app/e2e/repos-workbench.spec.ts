import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

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
 *
 * Phase 82 Theme C, wave 4: 10 of this file's 18 tests moved to
 * `src/features/repos/repos-panel.bridge.test.tsx`, mounting the real
 * `ReposPanel`. **The 8 that stay** are genuine Playwright territory: one
 * real-CSS assertion (the Git mark's computed brand-orange colour), three
 * geometry (`boundingBox()` comparisons for the tab bar's stats-before-close
 * ordering, the section headings' shared row height, and a folded repo's
 * trailing-edge alignment), one more geometry-and-cross-component (the commit
 * box's equal inset, which also needs the Changes workbench mounted), and
 * three genuine cross-component flows — "View all changes" opens a tab
 * hosted by `Workbench` (a sibling component `ReposPanel` does not render),
 * so its accordion counts, totals and close behaviour test `Workbench` +
 * `AllChangesView`, not this file's subject.
 */

const MAIN = '/tmp/midnite-studio';
const FEATURE = '/tmp/midnite-studio-feature';

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
    fetchUrl: 'git@github.com:bilo-io/midnite-studio.git',
    pushUrl: 'git@github.com:bilo-io/midnite-studio.git',
    forge: { host: 'github.com', owner: 'bilo-io', repo: 'midnite-studio', kind: 'github' },
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

/** See `clickRailLink` in `mock-bridge.ts` for why a plain `.click()` races the rail's own hover-expand. */
const goToChanges = (page: Page) => clickRailLink(page, 'Changes');

/**
 * The panel's own heading matches the status-bar button that summons it, word
 * for word and glyph for glyph — bare "Repos" beside an Octicons repo mark
 * read as a different feature from "Git Repos" beside the Git logo.
 *
 * The colour is asserted computed rather than by class, for the same reason as
 * in `status-bar.spec.ts`: the literal exists so the mark stays Git's regardless
 * of the accent the user picked.
 */
test('the panel heading is "Git Repos", in the Git mark and its brand orange', async ({ page }) => {
  await open(page);
  const heading = page.getByRole('heading', { name: 'Git Repos' });
  await expect(heading).toBeVisible();
  await expect(heading.locator('svg').first()).toHaveCSS('color', 'rgb(240, 80, 50)');
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
    page.getByRole('button', { name: /^Close (Working tree|midnite-studio)$/ }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Close feature/x' }).click();
  await expect(page.getByRole('tab', { name: 'feature/x' })).toHaveCount(0);
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

  await page.locator('button[aria-label="Collapse midnite-studio"]').click();
  /*
    Not `getByRole('heading', ...).toHaveCount(0)`: the folded tree stays
    attached, `inert` and clipped to a 0fr grid row (`repos-panel.tsx`'s
    `<Collapse>`) rather than removed, and Playwright's role engine does not
    factor the `inert` attribute into its visibility computation (confirmed by
    isolating `<div inert><h3>…</h3></div>` — the heading still resolves).
    `aria-expanded` on the toggle is the reliable, already-asserted-elsewhere
    signal that the fold actually happened.
  */
  await expect(page.locator('button[aria-label="Expand midnite-studio"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  /*
    Folded rows are read as a column, so the summary has to line up down the
    panel rather than start wherever each repository's name happens to end —
    and it belongs beside the sync control it explains, not beside the name.
  */
  const row = page
    .locator('div.group')
    .filter({ has: page.getByTestId('change-count') })
    .first();
  const pill = (await row.getByTestId('change-count').boundingBox())!;
  const sync = (await row.getByRole('button', { name: /^Fetch —/ }).boundingBox())!;
  /*
    Measured against the name button the summary lives in, NOT against the row.

    `ml-auto` pins the branch-and-count group to the trailing edge of that
    button, which is the whole claim — its x cannot depend on how long the
    repository's name is. The row is the wrong ruler: it has since grown a
    trailing cluster (the skill, git-actions and install/build/test/launch
    controls) to the right of the sync button, so "past the row's midpoint"
    now fails for a layout that is still exactly right.
  */
  const name = (await row
    .getByTestId('change-count')
    .locator('xpath=ancestor::button[1]')
    .boundingBox())!;

  expect(pill.x + pill.width).toBeLessThanOrEqual(sync.x);
  expect(pill.x + pill.width).toBeCloseTo(name.x + name.width, 0);
  expect(pill.x).toBeGreaterThan(name.x + name.width / 2);
});

test('commit message input has equal inset on all sides when empty', async ({ page }) => {
  await open(page);
  await goToChanges(page);

  const textarea = page.getByPlaceholder('Commit message');
  await expect(textarea).toBeVisible();

  const container = textarea.locator('xpath=ancestor::div[1]');
  const textareaBox = (await textarea.boundingBox())!;
  const containerBox = (await container.boundingBox())!;

  const left = textareaBox.x - containerBox.x;
  const right = containerBox.x + containerBox.width - (textareaBox.x + textareaBox.width);
  const top = textareaBox.y - containerBox.y;
  const bottom = containerBox.y + containerBox.height - (textareaBox.y + textareaBox.height);

  expect(Math.abs(left - right)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(top - bottom)).toBeLessThanOrEqual(1.5);
  expect(Math.abs(left - top)).toBeLessThanOrEqual(1.5);

  if (process.env.MSTUDIO_SHOTS) {
    await page.screenshot({ path: '/tmp/changes-commit-input.png' });
  }
});
