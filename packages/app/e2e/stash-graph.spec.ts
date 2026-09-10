import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Stashes drawn above the graph (Phase 22 Theme C).
 *
 * Phase 82 Theme C wave 5 moved this file's 3 tests to
 * `src/features/graph/stash-rows.bridge.test.tsx`, mounting `GraphView`
 * (plus `ReposPanel` for the sidebar-parity test) directly — that clicking a
 * stash row opens its inspector, that the sidebar's own stash list opens the
 * same inspector, and that a repo with more than the visible cap collapses
 * into an overflow row. The one test kept here is a smoke test that the
 * graph reaches the same inspector through the real, assembled app.
 */
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

const stash = (selector: string, message: string, sha: string) => ({
  selector,
  sha,
  parents: [SHA_A],
  message,
  authoredAt: Math.floor(Date.now() / 1000) - 3600,
  author: { name: 'Ada Lovelace', email: 'ada@example.com' },
});

test.describe('Stashes above the graph', () => {
  test('clicking a stash row opens its inspector', async ({ page }) => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [stash('stash@{0}', 'WIP on main: refactor the sidebar tree', SHA_B)],
      stashDetails: {
        'stash@{0}': { tracked: [], index: [], untracked: [] },
      },
    };
    await installMockBridge(page, data);
    await page.goto('/');

    await page.getByRole('button', { name: /Stash: WIP on main/ }).click();
    await expect(page.getByText('This stash changed no files.')).toBeVisible();
  });
});
