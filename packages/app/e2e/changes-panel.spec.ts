import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Changes panel's file lists.
 *
 * The tree, the roll-ups and the flat ordering are the commit inspector's
 * `ChangeTree`, and its own unit tests already pin the trie down. What only the
 * assembled panel can show is that the *right* numbers reach it: a partially
 * staged file has a different pair on each side, and a panel that read one
 * numstat for both would look entirely plausible while being wrong on exactly
 * the file that matters.
 */
const entry = (
  path: string,
  over: { staged?: string; unstaged?: string; origPath?: string | null } = {},
) => ({
  path,
  origPath: over.origPath ?? null,
  staged: over.staged ?? 'unmodified',
  unstaged: over.unstaged ?? 'modified',
  conflicted: false,
  similarity: null,
});

/**
 * One file staged and re-edited, two more in one folder, and one at the root.
 *
 * `src/a.ts` is the load-bearing row: it is in BOTH lists, with 5 lines staged
 * and 40 unstaged, so every total below can only be right by reading the two
 * sides separately.
 */
/** A trivial one-hunk diff, keyed by path so each test file gets its own. */
const diffFor = (path: string) => ({
  path,
  oldPath: path,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      heading: '@@ -1,2 +1,2 @@',
      oldStart: 1,
      oldLines: 2,
      newStart: 1,
      newLines: 2,
      lines: [
        { kind: 'del', oldNo: 1, newNo: null, text: 'const a = 1;', ranges: [], noNewline: false },
        { kind: 'add', oldNo: null, newNo: 1, text: 'const a = 2;', ranges: [], noNewline: false },
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

const base: MockFixtures = {
  ...fixtures,
  statusEntries: [
    entry('src/a.ts', { staged: 'modified', unstaged: 'modified' }),
    entry('src/nested/b.ts'),
    entry('README.md', { unstaged: 'untracked' }),
  ],
  statusCounts: {
    'staged:src/a.ts': { insertions: 5, deletions: 1 },
    'unstaged:src/a.ts': { insertions: 40, deletions: 4 },
    'unstaged:src/nested/b.ts': { insertions: 2, deletions: 0 },
    'unstaged:README.md': { insertions: 7, deletions: 0 },
  },
  diffs: {
    'wt:src/a.ts': diffFor('src/a.ts'),
    'wt:src/nested/b.ts': diffFor('src/nested/b.ts'),
    'wt:README.md': diffFor('README.md'),
  },
};

const open = async (page: Page, data: MockFixtures = base): Promise<void> => {
  await installMockBridge(page, data);
  await page.goto('/');
  await page.getByRole('link', { name: 'Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Changes' })).toBeVisible();
};

/** The panel-wide roll-up is the first totals element — it sits above both sections. */
const panelTotals = (page: Page) => page.getByTestId('change-totals').first();

const row = (page: Page, path: string) =>
  page.getByRole('button', { name: path, exact: true });

test('the panel totals the whole checkout, counting a two-sided file once', async ({ page }) => {
  await open(page);

  // Three paths, not four rows: `src/a.ts` is listed twice because staging acts
  // on one side at a time, but it is one changed file.
  await expect(panelTotals(page)).toContainText('3 files');
  // Lines DO add up across the sides — a staged hunk and an unstaged hunk in
  // the same file are different lines. 5+40+2+7 = 54, 1+4 = 5.
  await expect(panelTotals(page)).toContainText('+54');
  await expect(panelTotals(page)).toContainText('−5');
});

test('a row shows the counts for the side it is listed on', async ({ page }) => {
  await open(page);

  // The same path, twice, with different numbers. Reading one numstat for both
  // sides would put 40 on the staged row and nobody would notice.
  const rows = row(page, 'src/a.ts');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('+5');
  await expect(rows.nth(1)).toContainText('+40');
});

test('list view orders by change size and shows full paths', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'List the changed files by how much changed' }).click();

  // 44 > 7 > 2 — nothing like the path order, which is the whole point of the
  // second view.
  //
  // `[aria-pressed]` picks the SELECT button of each row. A plain
  // `getByRole('button')` also matches the stage/discard controls sitting in the
  // same `li`, which interleaves them into the order being asserted.
  const rows = page.getByTestId('changes-unstaged').locator('button[aria-pressed]');
  await expect(rows.nth(0)).toHaveAttribute('aria-label', 'src/a.ts');
  await expect(rows.nth(1)).toHaveAttribute('aria-label', 'README.md');
  await expect(rows.nth(2)).toHaveAttribute('aria-label', 'src/nested/b.ts');
});

test('tree view groups by folder, and a collapsed folder keeps its totals', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Group the changed files by folder' }).click();

  const src = page
    .getByTestId('changes-unstaged')
    .getByRole('button', { name: 'src', exact: true });

  // 40+2 insertions, 4 deletions, rolled up from the two files inside.
  await expect(src).toContainText('+42');
  await expect(row(page, 'src/nested/b.ts')).toBeVisible();

  await src.click();

  // The files go; the number does not. Collapsing to compare folders is
  // pointless if collapsing hides what you were comparing.
  await expect(row(page, 'src/nested/b.ts')).toHaveCount(0);
  await expect(src).toContainText('+42');
});

test('the tree ⇄ list choice survives a reload', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Group the changed files by folder' }).click();
  await expect(
    page.getByTestId('changes-unstaged').getByRole('button', { name: 'src', exact: true }),
  ).toBeVisible();

  await page.reload();
  await page.getByRole('link', { name: 'Changes' }).click();

  await expect(
    page.getByTestId('changes-unstaged').getByRole('button', { name: 'src', exact: true }),
  ).toBeVisible();
});

test('the staging buttons still act on the row they sit on', async ({ page }) => {
  await open(page);

  // The rows moved into a shared component with the actions in a slot; the one
  // thing that must not have changed is which path a button stages.
  await page.getByRole('button', { name: 'Stage src/nested/b.ts' }).click();

  const ops = await page.evaluate(
    () => (window as unknown as { __mgitOps: { op: string; args: { paths: string[] } }[] }).__mgitOps,
  );
  expect(ops).toHaveLength(1);
  expect(ops[0]?.op).toBe('stage');
  expect(ops[0]?.args.paths).toEqual(['src/nested/b.ts']);
});

test('View all changes shows every file, collapsed, with the panel totals at the top', async ({
  page,
}) => {
  await open(page);

  await page.getByRole('button', { name: 'View all changes', exact: true }).click();

  // Same roll-up the panel already carries above the lists, now heading the
  // right pane too — no second, possibly-disagreeing total.
  await expect(page.getByTestId('change-totals')).toHaveCount(2);
  await expect(page.getByTestId('change-totals').nth(1)).toContainText('3 files');
  await expect(page.getByTestId('change-totals').nth(1)).toContainText('+54');
  await expect(page.getByTestId('change-totals').nth(1)).toContainText('−5');

  // Collapsed by default — this is a summary, not an eagerly-fetched wall of
  // diffs.
  await expect(page.getByTestId('diff-view')).toHaveCount(0);
  const accordionRow = (pattern: string | RegExp) =>
    page.locator('button[aria-expanded]').filter({ hasText: pattern });
  await expect(accordionRow('README.md')).toBeVisible();

  // The staged-then-edited file is one row here, unlike the two it gets on the
  // left — there is nothing to stage in this view.
  await expect(accordionRow(/a\.ts/)).toHaveCount(1);

  await page.getByRole('button', { name: 'Expand all files' }).click();
  await expect(page.getByTestId('diff-view')).toHaveCount(3);
});

test('picking a file switches the pane back to its single diff, and back again', async ({
  page,
}) => {
  await open(page);

  await row(page, 'README.md').click();
  await expect(page.getByTestId('diff-view')).toHaveCount(1);

  await page.getByRole('button', { name: 'View all changes', exact: true }).click();
  await expect(page.getByTestId('diff-view')).toHaveCount(0);
  await expect(
    page.locator('button[aria-expanded]').filter({ hasText: 'README.md' }),
  ).toBeVisible();

  await row(page, 'src/nested/b.ts').click();
  await expect(page.getByTestId('diff-view')).toHaveCount(1);
  await expect(page.getByText('Select a file to see its diff.')).toHaveCount(0);
});

/**
 * The commit box: an empty message costs no vertical space (no button, one
 * line of textarea), and both come back once there is something to commit.
 */
test('the commit button only appears once a message is typed', async ({ page }) => {
  await open(page);
  const commitButton = page.getByRole('button', { name: /^Commit/ });
  await expect(commitButton).toHaveCount(0);

  await page.getByPlaceholder('Commit message').fill('fix: something');
  await expect(commitButton).toBeVisible();

  await page.getByPlaceholder('Commit message').fill('');
  await expect(commitButton).toHaveCount(0);
});

test('the commit textarea grows with content and shrinks back after committing', async ({
  page,
}) => {
  await open(page);
  const textarea = page.getByPlaceholder('Commit message');
  const oneLineHeight = await textarea.evaluate((el) => el.getBoundingClientRect().height);

  await textarea.fill('line one\nline two\nline three\nline four');
  const grownHeight = await textarea.evaluate((el) => el.getBoundingClientRect().height);
  expect(grownHeight).toBeGreaterThan(oneLineHeight);

  // `src/a.ts` is staged in the base fixture, so a non-empty message alone
  // satisfies `canSubmit`.
  await page.getByRole('button', { name: /^Commit/ }).click();

  await expect(page.getByRole('button', { name: /^Commit/ })).toHaveCount(0);
  const shrunkHeight = await textarea.evaluate((el) => el.getBoundingClientRect().height);
  expect(shrunkHeight).toBeLessThan(grownHeight);
});
