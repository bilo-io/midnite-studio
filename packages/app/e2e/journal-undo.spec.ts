import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 22 Theme H's one wired branch undo, driven through the surface that
 * actually offers it: the sidebar's branch row menu.
 *
 * Phase 82 Theme C wave 5 moved this file's 3 tests to
 * `src/features/repos/repos-panel.bridge.test.tsx`, mounting `ReposPanel`
 * (plus `ToastHost` and, for the journal-read test, `JournalList` mounted
 * alongside rather than navigated to via the History view) directly — the
 * delete's named toast and its Undo recreating the branch at its own sha,
 * both the delete and its undo landing in the journal, and rename's own
 * Undo. The one test kept here is a smoke test that the delete flow is
 * reachable and toasts through the real assembled app — everything about
 * what the toast's Undo actually does now lives in the jsdom test above.
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

test('deleting a branch toasts by name and offers an Undo', async ({ page }: { page: Page }) => {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  const menu = page.getByRole('button', { name: 'Actions for branch feature/shelved' });
  await menu.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await menu.click();
  await page.getByRole('menuitem', { name: /Delete feature\/shelved/ }).click();
  await page.getByRole('button', { name: 'Delete branch', exact: true }).click();

  const toast = page.getByRole('status').filter({ hasText: 'Deleted branch feature/shelved' });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Undo' })).toBeVisible();
});
