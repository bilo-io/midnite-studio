import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The stash inspector (Phase 22 Theme D).
 *
 * Three labelled sub-sections in one file list, not tabs — this is what
 * proves the assembled panel actually reads all three of a stash's parts
 * rather than only the tracked one `git stash show -p` would answer for, and
 * that clicking a file in any of them fetches that part's own diff.
 */
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const diffFor = (path: string, addedLine: string) => ({
  path,
  oldPath: path,
  change: 'modified',
  binary: false,
  oldMode: null,
  newMode: null,
  hunks: [
    {
      heading: '@@ -1 +1 @@',
      oldStart: 1,
      oldLines: 1,
      newStart: 1,
      newLines: 1,
      lines: [{ kind: 'add', oldNo: null, newNo: 1, text: addedLine, ranges: [], noNewline: false }],
    },
  ],
  insertions: 1,
  deletions: 0,
  contextLines: 3,
  combined: false,
  truncated: false,
  droppedLines: 0,
});

test.describe('The stash inspector', () => {
  test('shows tracked, index and untracked files as three sections, each with its own diff', async ({
    page,
  }) => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [
        {
          selector: 'stash@{0}',
          sha: SHA_B,
          parents: [SHA_A, SHA_A, SHA_A],
          message: 'WIP on main: try a layout change',
          authoredAt: Math.floor(Date.now() / 1000) - 3600,
          author: { name: 'Ada Lovelace', email: 'ada@example.com' },
        },
      ],
      stashDetails: {
        'stash@{0}': {
          tracked: [{ path: 'src/a.ts', oldPath: null, insertions: 1, deletions: 0 }],
          index: [{ path: 'src/b.ts', oldPath: null, insertions: 2, deletions: 0 }],
          untracked: [{ path: 'new.txt', oldPath: null, insertions: 3, deletions: 0 }],
        },
      },
      diffs: {
        'stash:stash@{0}:tracked:src/a.ts:3': diffFor('src/a.ts', 'diffed tracked line'),
        'stash:stash@{0}:index:src/b.ts:3': diffFor('src/b.ts', 'diffed index line'),
        'stash:stash@{0}:untracked:new.txt:3': diffFor('new.txt', 'diffed untracked line'),
      },
    };
    await installMockBridge(page, data);
    await page.goto('/');

    await page.getByRole('button', { name: /Stash: WIP on main/ }).click();

    await expect(page.getByRole('heading', { name: 'Tracked changes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Staged at stash time' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Untracked files' })).toBeVisible();

    await page.getByTestId('stash-files-tracked').getByRole('button', { name: 'src/a.ts' }).click();
    await expect(page.getByText('diffed tracked line')).toBeVisible();

    await page.getByTestId('stash-files-index').getByRole('button', { name: 'src/b.ts' }).click();
    await expect(page.getByText('diffed index line')).toBeVisible();

    await page.getByTestId('stash-files-untracked').getByRole('button', { name: 'new.txt' }).click();
    await expect(page.getByText('diffed untracked line')).toBeVisible();
  });

  test('reports a stale selector as not found rather than an empty panel', async ({ page }) => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [
        {
          selector: 'stash@{0}',
          sha: SHA_A,
          parents: [SHA_B],
          message: 'WIP on main: about to be dropped',
          authoredAt: Math.floor(Date.now() / 1000) - 3600,
          author: { name: 'Ada Lovelace', email: 'ada@example.com' },
        },
      ],
      // No `stashDetails` entry for this selector — the mock's `null` answer,
      // exactly as the real handler gives for a selector no longer in the repo.
    };
    await installMockBridge(page, data);
    await page.goto('/');

    await page.getByRole('button', { name: /Stash: WIP on main/ }).click();
    await expect(page.getByText('Stash not found')).toBeVisible();
  });
});
