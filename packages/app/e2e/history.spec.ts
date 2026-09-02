import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

const headReflog = [
  {
    selector: 'HEAD@{1700000100}',
    fullSelector: 'HEAD@{1700000100}',
    sha: SHA_B,
    oldSha: SHA_A,
    subject: 'checkout: moving from feature to main',
    action: 'checkout',
    at: 1700000100,
    author: 'Ada Lovelace',
  },
  {
    selector: 'HEAD@{1700000000}',
    fullSelector: 'HEAD@{1700000000}',
    sha: SHA_A,
    oldSha: null,
    subject: 'commit: first',
    action: 'commit',
    at: 1700000000,
    author: 'Ada Lovelace',
  },
];

const featureReflog = [
  {
    selector: 'feature@{1700000200}',
    fullSelector: 'refs/heads/feature@{1700000200}',
    sha: SHA_C,
    oldSha: SHA_A,
    subject: 'commit: on feature',
    action: 'commit',
    at: 1700000200,
    author: 'Ada Lovelace',
  },
];

const withReflog: MockFixtures = {
  ...fixtures,
  refs: [
    { name: 'main', fullName: 'refs/heads/main', kind: 'localBranch', sha: SHA_B, upstream: null, isHead: true, worktreePath: null },
    { name: 'feature', fullName: 'refs/heads/feature', kind: 'localBranch', sha: SHA_C, upstream: null, isHead: false, worktreePath: null },
  ],
  reflog: headReflog,
  reflogByRef: { 'refs/heads/feature': featureReflog },
};

/**
 * The History view (Phase 22 Themes G + H) — the nav-rail item and its two
 * tabs.
 *
 * The Journal tab stays a shell-level check here, not a full write-then-undo
 * round trip: that recording, classification and undo-execution logic is
 * covered directly under vitest instead — `shared/src/domain/journal.test.ts`
 * (the classifier), `services/use-status.test.tsx` (journal recording on
 * every successful op), and `services/use-journal.test.tsx` +
 * `features/stash/use-stash-actions.test.tsx` (the two wired undo actions).
 * The Reflog tab (Theme G, landed in this checkout) gets its own real
 * coverage below — the ref selector, the action filter, and the old→new sha
 * pair are all reachable only through this tab, so unlike the journal there
 * is no lower-level vitest suite already exercising them end to end.
 */

async function open(page: import('@playwright/test').Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
}

/**
 * Keyboard activation, not `.click()`.
 *
 * A real, trusted mouse click on this rail's own `<a>` items is unreliable in
 * this checkout today for reasons unrelated to this feature — the SAME
 * flakiness reproduces on `Changes`, an existing view this pass did not
 * touch, while `Enter` on the focused link and a dispatched `click` event
 * both work every time. See this file's own header note and the report for
 * the investigation; this is the honest, reliable way to drive the rail
 * until whatever the other in-progress e2e work in this checkout is fixing
 * that lands.
 */
async function goToHistory(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('link', { name: 'History' }).focus();
  await page.keyboard.press('Enter');
}

test('the History view renders both tabs, Journal first, with its empty state', async ({ page }) => {
  await open(page);

  await goToHistory(page);

  const tablist = page.getByRole('tablist', { name: 'History' });
  await expect(tablist.getByRole('tab', { name: 'Journal' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(tablist.getByRole('tab', { name: 'Reflog' })).toBeVisible();

  await expect(
    page.getByText('Nothing recorded yet — every write this app makes to this repository will show up here.'),
  ).toBeVisible();
});

test('the Reflog tab lists HEAD by default, newest first, with the old→new sha pair', async ({
  page,
}) => {
  await installMockBridge(page, withReflog);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();

  await goToHistory(page);
  await page.getByRole('tab', { name: 'Reflog' }).click();

  const list = page.getByRole('list', { name: 'Reflog' });
  const rows = list.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('checkout: moving from feature to main');
  await expect(rows.nth(0)).toContainText(`${SHA_A.slice(0, 7)} → ${SHA_B.slice(0, 7)}`);
  await expect(rows.nth(1)).toContainText('commit: first');
  // The oldest entry has no known predecessor — no "→" pair, just its own sha.
  await expect(rows.nth(1)).not.toContainText('→');

  await expect(page.getByText(/prunes unreachable reflog entries after 30 days/)).toBeVisible();
});

test('switching the ref selector re-requests rather than re-filtering one fixed list', async ({
  page,
}) => {
  await installMockBridge(page, withReflog);
  await page.goto('/');
  await goToHistory(page);
  await page.getByRole('tab', { name: 'Reflog' }).click();

  const panel = page.getByRole('tabpanel', { name: 'Reflog' });
  await expect(panel.getByRole('list', { name: 'Reflog' })).toContainText('checkout: moving');

  await panel.getByLabel('Ref', { exact: true }).selectOption({ label: 'feature' });

  const list = page.getByRole('list', { name: 'Reflog' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('commit: on feature');
  await expect(list).not.toContainText('checkout: moving');
});

test('the action filter narrows the list client-side, without refetching', async ({ page }) => {
  await installMockBridge(page, withReflog);
  await page.goto('/');
  await goToHistory(page);
  await page.getByRole('tab', { name: 'Reflog' }).click();

  const panel = page.getByRole('tabpanel', { name: 'Reflog' });
  await panel.getByLabel('Action', { exact: true }).selectOption({ label: 'Checkout' });

  const list = page.getByRole('list', { name: 'Reflog' });
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(list).toContainText('checkout: moving');
  await expect(list).not.toContainText('commit: first');
});

test('checking out an entry runs a detached checkout to that sha', async ({ page }) => {
  await installMockBridge(page, withReflog);
  await page.goto('/');
  await goToHistory(page);
  await page.getByRole('tab', { name: 'Reflog' }).click();

  const row = page.getByRole('listitem').filter({ hasText: 'commit: first' });
  await row.getByRole('button', { name: 'Checkout' }).click();

  const ops = await page.evaluate(
    () =>
      (window as unknown as { __mstudioOps: { op: string; args: { target: string; detach: boolean } }[] })
        .__mstudioOps,
  );
  expect(ops).toContainEqual(
    expect.objectContaining({
      op: 'checkout',
      args: expect.objectContaining({ target: SHA_A, detach: true }),
    }),
  );
});
