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
