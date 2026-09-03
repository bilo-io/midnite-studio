import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Phase 22 Theme H's one wired branch undo, driven through the surface that
 * actually offers it: the sidebar's branch row menu.
 *
 * The recording, classification and undo-execution logic each have their own
 * vitest coverage (`shared/src/domain/journal.test.ts`,
 * `services/use-journal.test.tsx`, `services/use-status.test.tsx`). What only
 * an assembled run can show is that the CALL SITE hands the wrapper the two
 * fields the undo reads. `useTargetedGitOp` defaults `refBefore` to `'HEAD'`
 * and `headBefore` to the checkout's current oid — right for `commit`/`reset`,
 * and wrong for a branch you are not on — so a `branch-delete` site that omits
 * its `journalHint` still journals and still shows an Undo button, and that
 * button then recreates a branch literally named `HEAD` at the wrong sha. The
 * graph's copy always passed the hint; the sidebar's did not, and nothing
 * failed. This spec is what fails.
 */
const SHA = 'b'.repeat(40);

const localRef = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: SHA,
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

const data: MockFixtures = {
  ...fixtures,
  refs: [localRef('main', { isHead: true, sha: 'a'.repeat(40) }), localRef('feature/shelved')],
};

type OpCall = { op: string; args: Record<string, unknown> };

const opsFor = (page: Page, op: string): Promise<OpCall[]> =>
  page.evaluate(
    (name) =>
      (window as unknown as { __mstudioOps: OpCall[] }).__mstudioOps.filter((c) => c.op === name),
    op,
  );

/** Delete `feature/shelved` from its own row menu, through the confirm. */
async function deleteShelvedBranch(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  const menu = page.getByRole('button', { name: 'Actions for branch feature/shelved' });
  await menu.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await menu.click();
  await page.getByRole('menuitem', { name: /Delete feature\/shelved/ }).click();
  await page.getByRole('button', { name: 'Delete branch', exact: true }).click();
}

test('deleting a branch toasts by name and offers an Undo that restores that branch', async ({
  page,
}) => {
  await deleteShelvedBranch(page);

  // Named, not the wrapper's generic "Deleted a branch" — a toast that cannot
  // say which branch went is not something you can act on.
  const toast = page.getByRole('status').filter({ hasText: 'Deleted branch feature/shelved' });
  await expect(toast).toBeVisible();

  await toast.getByRole('button', { name: 'Undo' }).click();

  // The undo is a forward `branchCreate` at the deleted branch's own sha — not
  // `HEAD`, and not a branch named `HEAD`.
  await expect
    .poll(() => opsFor(page, 'branchCreate'))
    .toEqual([
      {
        op: 'branchCreate',
        args: expect.objectContaining({
          name: 'feature/shelved',
          startPoint: SHA,
          checkout: false,
        }),
      },
    ]);
});

test('the delete and its undo both land in the journal, the undo marked as one', async ({
  page,
}) => {
  await deleteShelvedBranch(page);

  const toast = page.getByRole('status').filter({ hasText: 'Deleted branch feature/shelved' });
  await toast.getByRole('button', { name: 'Undo' }).click();

  await page.getByRole('link', { name: 'History' }).focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('tab', { name: 'Journal' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  /*
    Scoped to the journal list, not the page: an un-dismissed toast carries the
    same words, so an unscoped `getByText` here is a strict-mode violation
    waiting on the toast's 8s auto-dismiss to decide whether it fires.
  */
  const journal = page.getByRole('list', { name: 'Ops journal' });
  // Newest first: the undo's own entry, then the delete it undid.
  await expect(journal.getByText('Undo: Deleted branch feature/shelved')).toBeVisible();
  await expect(journal.getByText('Deleted branch feature/shelved', { exact: true })).toBeVisible();
});

/**
 * The rest of Theme H's remaining undo executors (`commit`/`reset`/`checkout`/
 * `branch-create`/`branch-rename`/`stash-push`) each have unit coverage in
 * `services/use-journal.test.tsx`. Rename is the one worth an assembled run
 * too: its undo depends on `headAfter` carrying the new name captured by
 * `use-graph-actions.ts`'s own `journalHint` — a field every other op treats
 * as a sha — so this is what proves the call site actually threads it through
 * rather than the type merely allowing it to.
 */
test('renaming a branch offers an Undo that renames it back', async ({ page }) => {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  const menu = page.getByRole('button', { name: 'Actions for branch feature/shelved' });
  await menu.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await menu.click();
  await page.getByRole('menuitem', { name: 'Rename…' }).click();
  await page.getByLabel('New name').fill('feature/renamed');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();

  const toast = page.getByRole('status').filter({ hasText: 'Renamed feature/shelved to feature/renamed' });
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Undo' }).click();

  await expect
    .poll(() => opsFor(page, 'branchRename'))
    .toEqual([
      {
        op: 'branchRename',
        args: expect.objectContaining({ from: 'feature/shelved', to: 'feature/renamed' }),
      },
      {
        op: 'branchRename',
        args: expect.objectContaining({ from: 'feature/renamed', to: 'feature/shelved' }),
      },
    ]);
});
