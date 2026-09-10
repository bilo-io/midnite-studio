import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Changes panel's file lists.
 *
 * **14 of this spec's original 17 tests moved to `status-panel.bridge.test.tsx`
 * under jsdom** (Phase 82 Theme C, wave 2): the panel-wide and per-row
 * totals, the staging/stash/discard actions, the "view all" accordion, the
 * commit button's visibility rule, and the two sections folding
 * independently. The tree-grouping and totals-formatting assertions this
 * spec also carried moved into `build-change-tree.test.ts` and
 * `change-tree.test.tsx` instead — the phase doc's own instruction, since
 * both files already had partial coverage of the same trie. See those
 * files' own header comments for the removed-test → replacement-test
 * mapping.
 *
 * **3 remain here.** "The tree ⇄ list choice survives a reload" needs real
 * `zustand/persist` rehydration — the same reasoning
 * `commit-detail.bridge.test.tsx`'s header comment gives for its own reload
 * stragglers — and its non-reload half is already redundant with
 * `change-tree.test.tsx`'s new collapse test. "The toolbar icon buttons stay
 * visible … when the totals text is very wide" and "the commit textarea
 * grows and shrinks back" both read a real `getBoundingClientRect`/
 * `toBeInViewport`, permanently zero under jsdom's own layout engine.
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

/**
 * Click the rail's Changes link on a freshly (re)loaded page.
 *
 * The rail defaults to `navMode: 'auto'` — collapsed to icons until hovered,
 * then it grows to show labels. Hovering the link is what starts that grow,
 * so a plain `.click()` on a cold rail races its own hover: Playwright moves
 * the pointer to the collapsed icon's centre, the resulting `mouseenter`
 * kicks off the rail's expansion, and by the time `mousedown`/`mouseup` land
 * at that same fixed screen point the item has already reflowed out from
 * under it — onto whatever now occupies that pixel, never onto the link. No
 * amount of waiting *after* the click can recover a click that never reached
 * its target, which is why every spec in this file was failing on the same
 * "Changes" heading never appearing. Hovering first and waiting for the
 * link's own expanded label to render turns "wait out the race" into a real,
 * observable precondition instead of a guessed delay.
 */
const clickChangesNav = async (page: Page): Promise<void> => {
  const link = page.getByRole('link', { name: 'Changes' });
  await link.hover();
  await expect(link.getByText('Changes', { exact: true })).toBeVisible();
  await link.click();
};

const open = async (page: Page, data: MockFixtures = base): Promise<void> => {
  await installMockBridge(page, data);
  await page.goto('/');
  await clickChangesNav(page);
  await expect(page.getByRole('heading', { name: 'Changes' })).toBeVisible();
};

test('the tree ⇄ list choice survives a reload', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Group the changed files by folder' }).click();
  await expect(
    page.getByTestId('changes-unstaged').getByRole('button', { name: 'src', exact: true }),
  ).toBeVisible();

  await page.reload();
  await clickChangesNav(page);

  await expect(
    page.getByTestId('changes-unstaged').getByRole('button', { name: 'src', exact: true }),
  ).toBeVisible();
});

test('the toolbar icon buttons stay visible and clickable when the totals text is very wide', async ({
  page,
}) => {
  // A huge insertions/deletions pair makes the "N files / +X −Y" label as wide
  // as it gets — the exact condition that used to shove the icon buttons past
  // the panel's right edge instead of shrinking the label.
  await open(page, {
    ...base,
    statusCounts: {
      'staged:src/a.ts': { insertions: 5, deletions: 1 },
      'unstaged:src/a.ts': { insertions: 123_456_789, deletions: 4 },
      'unstaged:src/nested/b.ts': { insertions: 2, deletions: 0 },
      'unstaged:README.md': { insertions: 987_654_321, deletions: 0 },
    },
  });

  const viewAll = page.getByRole('button', { name: 'View all changes', exact: true });
  const listView = page.getByRole('button', {
    name: 'List the changed files by how much changed',
  });

  await expect(viewAll).toBeInViewport();
  await expect(listView).toBeInViewport();
  await viewAll.click();
  await expect(page.getByTestId('diff-view')).toHaveCount(0);
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
