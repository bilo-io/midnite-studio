import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Stashes drawn above the graph (Phase 22 Theme C).
 *
 * The pseudo-rows themselves are a rendering concern the phase's screenshot
 * spec already covers; what this asserts is the one thing a picture can't —
 * that clicking one actually opens the stash it names, that the sidebar's
 * own stash list opens the same panel, and that a repo with more than the
 * visible cap collapses into an overflow row rather than pushing the real
 * commit history down the pane.
 */
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

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

  test('the sidebar list opens the same inspector as the graph row', async ({ page }) => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [stash('stash@{0}', 'WIP on main: refactor the sidebar tree', SHA_B)],
      stashDetails: {
        'stash@{0}': { tracked: [], index: [], untracked: [] },
      },
    };
    await installMockBridge(page, data);
    await page.goto('/');

    await page.getByRole('heading', { name: 'Stashes' }).waitFor();
    // The sidebar row's own accessible name is the plain message — the graph
    // pseudo-row's is `Stash: <message>` (its `aria-label`), so this can only
    // match the sidebar's row.
    await page
      .getByRole('button', { name: 'WIP on main: refactor the sidebar tree', exact: true })
      .click();
    await expect(page.getByText('This stash changed no files.')).toBeVisible();
  });

  test('collapses past two entries into an overflow row', async ({ page }) => {
    const data: MockFixtures = {
      ...fixtures,
      stashes: [
        stash('stash@{0}', 'WIP on main: first', SHA_A),
        stash('stash@{1}', 'WIP on main: second', SHA_B),
        stash('stash@{2}', 'WIP on main: third', SHA_C),
      ],
    };
    await installMockBridge(page, data);
    await page.goto('/');

    await expect(page.getByRole('button', { name: /Stash: WIP on main: first/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Stash: WIP on main: second/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Stash: WIP on main: third/ })).toHaveCount(0);
    await expect(page.getByText('+1 more stash — see the sidebar')).toBeVisible();
  });
});
