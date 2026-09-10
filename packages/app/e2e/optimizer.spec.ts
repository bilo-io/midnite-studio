import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * The Workspace Optimizer's feature gate (Phase 59 Theme A).
 *
 * Phase 82 Theme C wave 3 moved the rest of this file's tests to
 * `src/features/optimizer/optimizer-page.bridge.test.tsx`, mounting
 * `OptimizerPage` directly. **The 2 tests left here are not about anything
 * inside the Optimizer** — they are about whether the view is reachable at
 * all: the rail link's presence gated on a Settings checkbox, and `app.tsx`'s
 * own redirect away from a persisted `activeView: 'optimizer'` the setting no
 * longer allows. Both need the app's outer rail/routing shell, which mounting
 * `OptimizerPage` alone bypasses entirely.
 */

test.describe('the feature gate', () => {
  test('the view is absent from the rail with the setting off, and appears once switched on', async ({
    page,
  }) => {
    await installMockBridge(page, fixtures);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Optimizer', exact: true })).toHaveCount(0);

    await page.getByRole('button', { name: 'Settings' }).click();
    await page
      .getByRole('navigation', { name: 'Settings pages' })
      .getByRole('button', { name: 'Workspace Optimizer' })
      .click();
    await page.getByRole('checkbox', { name: 'Enable Workspace Optimizer' }).check();

    await expect(page.getByRole('link', { name: 'Optimizer', exact: true })).toBeVisible();
  });

  /**
   * The setting only ever flips through the Settings page, which is itself a
   * `ViewId` — so navigating there to flip it already leaves 'optimizer'.
   * The scenario the app.tsx:608 redirect actually guards is a persisted
   * `activeView: 'optimizer'` the setting no longer allows (a second window's
   * toggle syncing in, or a settings rollback) — reproduced directly by
   * seeding both into storage and loading fresh, rather than choreographed
   * through the Settings UI, which cannot reach this state at all.
   */
  test('a persisted activeView of "optimizer" the setting no longer allows redirects to Graph rather than stranding the user', async ({
    page,
  }) => {
    await installMockBridge(page, fixtures);
    await page.addInitScript(() => {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 9 };
      persisted.state = { ...persisted.state, activeView: 'optimizer', optimizerEnabled: false };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Workspace Optimizer' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Optimizer', exact: true })).toHaveCount(0);
  });
});
