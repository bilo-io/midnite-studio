import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Workspace Optimizer (Phase 59 Themes A, B, C, E — Theme D's Memory tab
 * and kill path are deliberately out of scope for this batch and are not
 * exercised here; the phase doc's Theme F explicitly leaves the arbitrary-PID
 * kill path "not automated" and the "is this the right posture" question
 * "open, for a human").
 */

const SCAN_RESULT = {
  totalBytes: 300,
  byCategory: { nodeModules: 200, buildOutput: 100, staleWorktree: 0, looseObjects: 0 },
  items: [
    {
      path: '/tmp/midnite-studio/node_modules',
      bytes: 200,
      category: 'nodeModules',
      repoId: 'repo-1',
    },
    { path: '/tmp/midnite-studio/dist', bytes: 100, category: 'buildOutput', repoId: 'repo-1' },
  ],
  truncated: false,
};

const GPU_STATS = { model: 'Apple M2 Pro', vramBytes: 16 * 1024 * 1024 * 1024, loadPercent: 37 };

/** Every optimizer tab's own nav button — never ambiguous with "Run Smart Scan"'s CTA. */
const tab = (page: Page, name: 'Smart Scan' | 'Storage' | 'Memory' | 'GPU') =>
  page.getByRole('navigation', { name: 'Optimizer tabs' }).getByRole('button', { name, exact: true });

/** Seeds the persisted setting directly — flipping it live is its own test below. */
async function seedOptimizerEnabled(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stored = localStorage.getItem('midnite-studio.ui');
    const persisted = stored ? JSON.parse(stored) : { version: 8 };
    persisted.state = { ...persisted.state, optimizerEnabled: true };
    localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
  });
}

async function openOptimizer(page: Page, data: MockFixtures = fixtures): Promise<void> {
  await seedOptimizerEnabled(page);
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(async () => {
    await clickRailLink(page, 'Optimizer');
    await expect(page.getByRole('heading', { name: 'Workspace Optimizer' })).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 12000 });
}

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
      const persisted = stored ? JSON.parse(stored) : { version: 8 };
      persisted.state = { ...persisted.state, activeView: 'optimizer', optimizerEnabled: false };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    });

    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Workspace Optimizer' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Optimizer', exact: true })).toHaveCount(0);
  });
});

test.describe('the four tabs', () => {
  test('render and switch', async ({ page }) => {
    await openOptimizer(page);

    await expect(tab(page, 'Smart Scan')).toHaveAttribute('aria-current', 'page');

    await tab(page, 'Storage').click();
    await expect(page.getByText('Run a Smart Scan first')).toBeVisible();

    await tab(page, 'Memory').click();
    await expect(page.getByText('The Memory tab lands in a follow-up phase.')).toBeVisible();

    await tab(page, 'GPU').click();
    await expect(page.getByText('Load, last 60s')).toBeVisible();

    await tab(page, 'Smart Scan').click();
    await expect(page.getByText('Finds reclaimable space')).toBeVisible();
  });
});

test.describe('Smart Scan + Storage', () => {
  test('a scan hands its ScanResult to Storage', async ({ page }) => {
    await openOptimizer(page, { ...fixtures, optimizer: { scanResult: SCAN_RESULT } });

    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await expect(page.getByText('300 B reclaimable')).toBeVisible();
    await expect(page.getByText('node_modules')).toBeVisible();
    await expect(page.getByText('Build output')).toBeVisible();

    await tab(page, 'Storage').click();
    await expect(page.getByRole('img', { name: 'Reclaimable storage by category' })).toBeVisible();
    await expect(page.getByText('/tmp/midnite-studio/node_modules')).toBeVisible();
    await expect(page.getByText('/tmp/midnite-studio/dist')).toBeVisible();
  });

  test('Clean shows the confirm with a real item count and byte figure, and the item leaves the list on confirm', async ({
    page,
  }) => {
    await openOptimizer(page, { ...fixtures, optimizer: { scanResult: SCAN_RESULT } });
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await expect(page.getByText('node_modules')).toBeVisible();

    await page
      .getByRole('listitem')
      .filter({ hasText: 'node_modules' })
      .getByRole('button', { name: 'Clean' })
      .click();

    await expect(page.getByRole('heading', { name: 'Clean node_modules?' })).toBeVisible();
    await expect(page.getByText('1 item will be moved to the trash.')).toBeVisible();
    await expect(page.getByText('200 B will be freed.')).toBeVisible();

    await page.getByRole('button', { name: 'Move to Trash' }).click();

    await expect(page.getByText('node_modules')).not.toBeVisible();
    await expect(page.getByText('Build output')).toBeVisible();
  });

  test('the extra-root folder picker', async ({ page }) => {
    await openOptimizer(page, {
      ...fixtures,
      optimizer: { scanResult: SCAN_RESULT },
      pickDirectoryResult: '/Users/bilo/side-project',
    });

    await page.getByRole('button', { name: 'Add a folder to scan' }).click();
    await expect(page.getByText('/Users/bilo/side-project')).toBeVisible();

    // The chosen root survives a scan — dismissible, not implicit.
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await expect(page.getByText('300 B reclaimable')).toBeVisible();
    await expect(page.getByText('/Users/bilo/side-project')).toBeVisible();

    await page.getByRole('button', { name: 'Remove extra scan folder' }).click();
    await expect(page.getByText('/Users/bilo/side-project')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Add a folder to scan' })).toBeVisible();
  });
});

test.describe('GPU tab', () => {
  test('renders info and a growing 60s chart, no temperature field, and disabled Tweak toggles', async ({
    page,
  }) => {
    await openOptimizer(page, { ...fixtures, optimizer: { gpu: GPU_STATS } });
    await tab(page, 'GPU').click();

    await expect(page.getByText('Apple M2 Pro')).toBeVisible();
    await expect(page.getByText('17.2 GB VRAM')).toBeVisible();
    await expect(page.getByRole('img', { name: 'GPU load, last 60 seconds' })).toBeVisible();

    await expect(page.getByText(/temperature/i)).toHaveCount(0);

    for (const label of ['Prefer integrated GPU', 'Disable GPU acceleration for terminals']) {
      await expect(page.getByText(label, { exact: false })).toBeVisible();
    }
    await expect(page.getByText('not wired yet').first()).toBeVisible();
    await expect(page.locator('input[type="checkbox"][disabled]')).toHaveCount(2);
  });
});
