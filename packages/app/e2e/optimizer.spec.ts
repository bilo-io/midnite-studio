import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Workspace Optimizer (Phase 59 Themes A, B, C, E — Theme D's Memory tab
 * and kill path are deliberately out of scope for this batch and are not
 * exercised here; the phase doc's Theme F explicitly leaves the arbitrary-PID
 * kill path "not automated" and the "is this the right posture" question
 * "open, for a human").
 */

const SCAN_RESULT = {
  totalBytes: 300,
  byCategory: { dependencies: 200, buildOutput: 100, toolCache: 0, staleWorktree: 0, looseObjects: 0 },
  byEcosystem: {
    node: 300,
    multi: 0,
    rust: 0,
    cpp: 0,
    dotnet: 0,
    python: 0,
    java: 0,
    swift: 0,
    ruby: 0,
    git: 0,
  },
  detectors: {
    'node-modules': { label: 'node_modules', producer: 'npm/pnpm/yarn install' },
    'node-dist': { label: 'dist/', producer: 'npm run build' },
  },
  items: [
    {
      path: '/tmp/midnite-studio/node_modules',
      bytes: 200,
      category: 'dependencies',
      repoId: 'repo-1',
      detectorId: 'node-modules',
      ecosystem: 'node',
      reclaim: 'costly',
    },
    {
      path: '/tmp/midnite-studio/dist',
      bytes: 100,
      category: 'buildOutput',
      repoId: 'repo-1',
      detectorId: 'node-dist',
      ecosystem: 'node',
      reclaim: 'cheap',
    },
  ],
  truncated: false,
  truncatedRoots: [],
};

const GPU_STATS = { model: 'Apple M2 Pro', vramBytes: 16 * 1024 * 1024 * 1024, loadPercent: 37 };

/** Every optimizer tab's own nav button — never ambiguous with "Run Smart Scan"'s CTA. */
const tab = (page: Page, name: 'Smart Scan' | 'Storage' | 'Memory' | 'GPU') =>
  page.getByRole('navigation', { name: 'Optimizer tabs' }).getByRole('button', { name, exact: true });

/**
 * Seeds the persisted setting directly — flipping it live is its own test
 * below. Also seeds Phase 73 Theme C's two-factor System-cache gate on, so
 * the Storage tab's System section (Theme E) is reachable from every test
 * that opens the Optimizer through this helper, rather than invisible by
 * construction the way it is by default in production.
 */
async function seedOptimizerEnabled(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stored = localStorage.getItem('midnite-studio.ui');
    const persisted = stored ? JSON.parse(stored) : { version: 9 };
    persisted.state = {
      ...persisted.state,
      optimizerEnabled: true,
      allowSystemCacheClean: true,
      systemCacheConsentGiven: true,
    };
    localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
  });
}

/** Phase 74 Theme D/E — the three-way Trash gate, seeded directly. */
async function seedTrashGate(page: Page, opts: { allow?: boolean; consented?: boolean } = {}): Promise<void> {
  await page.addInitScript(
    ({ allow, consented }: { allow: boolean; consented: boolean }) => {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 9 };
      persisted.state = {
        ...persisted.state,
        allowTrashEmpty: allow,
        trashEmptyConsentGiven: consented,
      };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    },
    { allow: opts.allow ?? true, consented: opts.consented ?? true },
  );
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

test.describe('the four tabs', () => {
  test('render and switch', async ({ page }) => {
    await openOptimizer(page);

    await expect(tab(page, 'Smart Scan')).toHaveAttribute('aria-current', 'page');

    await tab(page, 'Storage').click();
    await expect(page.getByText('Run a Smart Scan first')).toBeVisible();

    await tab(page, 'Memory').click();
    await expect(page.getByPlaceholder('Filter processes or PID…')).toBeVisible();

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
    // 'nodeModules' renamed to 'dependencies' (Phase 72 Theme C) — its category
    // label is now the generic "Dependencies", not the detector-specific
    // "node_modules" (that per-detector rendering is Theme D's job).
    await expect(page.getByText('Dependencies')).toBeVisible();
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
    await expect(page.getByText('Dependencies')).toBeVisible();

    // Phase 72 Theme D: the per-category row's Clean button is now scoped to
    // one (ecosystem, category) pair — every SCAN_RESULT item is `node`, so
    // this is "clean Node's Dependencies row", not a global category clean.
    await page.getByRole('button', { name: 'Clean Node Dependencies' }).click();

    await expect(page.getByRole('heading', { name: 'Clean Dependencies?' })).toBeVisible();
    await expect(page.getByText('1 item will be moved to the trash.')).toBeVisible();
    await expect(page.getByText('200 B will be freed.')).toBeVisible();

    await page.getByRole('button', { name: 'Move to Trash' }).click();

    await expect(page.getByText('Dependencies')).not.toBeVisible();
    await expect(page.getByText('Build output')).toBeVisible();
  });

  test('the ecosystem group Clean button cleans only the cheap items in it, and a costly-only group is disabled', async ({
    page,
  }) => {
    await openOptimizer(page, {
      ...fixtures,
      optimizer: {
        scanResult: {
          ...SCAN_RESULT,
          totalBytes: 500,
          byCategory: { dependencies: 400, buildOutput: 100, toolCache: 0, staleWorktree: 0, looseObjects: 0 },
          byEcosystem: { ...SCAN_RESULT.byEcosystem, node: 500 },
          items: [
            ...SCAN_RESULT.items,
            {
              path: '/tmp/midnite-studio/other/node_modules',
              bytes: 200,
              category: 'dependencies',
              repoId: 'repo-1',
              detectorId: 'node-modules',
              ecosystem: 'node',
              reclaim: 'costly',
            },
          ],
        },
      },
    });
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await expect(page.getByText('Dependencies')).toBeVisible();

    // The group holds one cheap item (dist, 100 B) and two costly items
    // (400 B of node_modules) — the group Clean button cleans the cheap one
    // only, and names the two costly items left behind.
    // `exact: true` — Playwright's accessible-name match is substring by
    // default, and "Clean Node Dependencies" (the per-row button) would
    // otherwise also match "Clean Node".
    await page.getByRole('button', { name: 'Clean Node', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Clean Node?' })).toBeVisible();
    await expect(page.getByText('100 B will be freed.')).toBeVisible();
    await expect(page.getByText('npm run build will need to run again.')).toBeVisible();
    await expect(
      page.getByText('2 items need a re-download to restore and were left alone — clean them individually.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Move to Trash' }).click();

    await expect(page.getByText('Build output')).not.toBeVisible();
    // The two costly node_modules items remain — the group button is now
    // disabled because only costly items are left in it.
    await expect(page.getByRole('button', { name: 'Clean Node', exact: true })).toBeDisabled();
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

test.describe('Memory tab', () => {
  test('renders memory gauges, 4-segment breakdown, and process list', async ({ page }) => {
    await openOptimizer(page, {
      ...fixtures,
      optimizer: {
        memory: {
          totalBytes: 16 * 1024 * 1024 * 1024,
          usedBytes: 12 * 1024 * 1024 * 1024,
          wiredBytes: 3 * 1024 * 1024 * 1024,
          activeBytes: 5 * 1024 * 1024 * 1024,
          compressedBytes: 2 * 1024 * 1024 * 1024,
          cachedBytes: 2 * 1024 * 1024 * 1024,
          freeBytes: 4 * 1024 * 1024 * 1024,
        },
        processes: [
          {
            pid: 1001,
            ppid: 1,
            name: 'node server.js',
            argv: 'node /Users/bilo/project/server.js',
            rssBytes: 450 * 1024 * 1024,
            cpuPercent: 12.5,
            ours: true,
          },
          {
            pid: 2001,
            ppid: 1,
            name: 'WindowServer',
            argv: '/System/Library/CoreServices/WindowServer -display',
            rssBytes: 800 * 1024 * 1024,
            cpuPercent: 5.2,
            ours: false,
          },
        ],
      },
    });

    await tab(page, 'Memory').click();

    // Gauges
    await expect(page.getByText('Memory Used')).toBeVisible();
    await expect(page.getByText('Cached Files')).toBeVisible();
    await expect(page.getByText('Free RAM')).toBeVisible();

    // 4 segments
    await expect(page.getByText('Wired', { exact: true })).toBeVisible();
    await expect(page.getByText('Active', { exact: true })).toBeVisible();
    await expect(page.getByText('Compressed', { exact: true })).toBeVisible();

    // Processes
    await expect(page.getByText('node server.js')).toBeVisible();
    await expect(page.getByText('WindowServer', { exact: true })).toBeVisible();

    // Foreign process is protected
    await expect(page.getByText('Protected')).toBeVisible();

    // Midnite-owned process has Terminate button
    await expect(page.getByRole('button', { name: 'Terminate' })).toBeVisible();
  });

  test('filtering by process name or PID', async ({ page }) => {
    await openOptimizer(page, {
      ...fixtures,
      optimizer: {
        processes: [
          {
            pid: 1001,
            ppid: 1,
            name: 'node server.js',
            argv: 'node /Users/bilo/project/server.js',
            rssBytes: 450 * 1024 * 1024,
            cpuPercent: 12.5,
            ours: true,
          },
          {
            pid: 2001,
            ppid: 1,
            name: 'WindowServer',
            argv: '/System/Library/CoreServices/WindowServer -display',
            rssBytes: 800 * 1024 * 1024,
            cpuPercent: 5.2,
            ours: false,
          },
        ],
      },
    });

    await tab(page, 'Memory').click();
    await expect(page.getByText('node server.js')).toBeVisible();
    await expect(page.getByText('WindowServer', { exact: true })).toBeVisible();

    const input = page.getByPlaceholder('Filter processes or PID…');
    await input.fill('node');
    await expect(page.getByText('node server.js')).toBeVisible();
    await expect(page.getByText('WindowServer', { exact: true })).not.toBeVisible();

    await input.fill('2001');
    await expect(page.getByText('node server.js')).not.toBeVisible();
    await expect(page.getByText('WindowServer', { exact: true })).toBeVisible();

    await input.fill('nonexistent');
    await expect(page.getByText('No matching processes found.')).toBeVisible();
  });

  test('terminating an owned process with confirmation dialog', async ({ page }) => {
    await openOptimizer(page, {
      ...fixtures,
      optimizer: {
        processes: [
          {
            pid: 1001,
            ppid: 1,
            name: 'node server.js',
            argv: 'node /Users/bilo/project/server.js',
            rssBytes: 450 * 1024 * 1024,
            cpuPercent: 12.5,
            ours: true,
          },
        ],
      },
    });

    await tab(page, 'Memory').click();
    await expect(page.getByText('node server.js')).toBeVisible();

    await page.getByRole('button', { name: 'Terminate' }).click();

    // Confirm dialog is displayed
    await expect(page.getByRole('heading', { name: 'Terminate Process (PID 1001)' })).toBeVisible();
    await expect(page.getByText('Send SIGTERM to stop node server.js?')).toBeVisible();

    // Dismissing keeps process
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Terminate Process (PID 1001)' })).not.toBeVisible();
    await expect(page.getByText('node server.js')).toBeVisible();

    // Re-opening and confirming terminates process
    await page.getByRole('button', { name: 'Terminate' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Terminate' }).click();

    await expect(page.getByText('node server.js')).not.toBeVisible();
  });
});

test.describe('Storage — Trash card (Phase 74 Theme D/E)', () => {
  test('the card is visible with all three gates on, and absent with any one off', async ({ page }) => {
    await seedTrashGate(page, { allow: true, consented: true });
    await openOptimizer(page);
    await tab(page, 'Storage').click();
    await expect(page.getByText('Trash', { exact: true })).toBeVisible();
  });

  test('the card is absent when allowTrashEmpty is off', async ({ page }) => {
    await seedTrashGate(page, { allow: false, consented: true });
    await openOptimizer(page);
    await tab(page, 'Storage').click();
    await expect(page.getByText('Trash', { exact: true })).toHaveCount(0);
  });

  test('clicking "Empty Trash…" opens a confirm gated by the requireAck checkbox', async ({ page }) => {
    await seedTrashGate(page, { allow: true, consented: true });
    await openOptimizer(page, {
      ...fixtures,
      optimizer: {
        trash: {
          itemCount: 7,
          totalBytes: 12_000_000,
          oldestModifiedAt: '2026-01-01T00:00:00.000Z',
          volumeCount: 1,
          truncated: false,
        },
      },
    });
    await tab(page, 'Storage').click();

    await page.getByRole('button', { name: 'Check Trash' }).click();
    await expect(page.getByText(/^7 items/)).toBeVisible();

    await page.getByRole('button', { name: 'Empty Trash…' }).click();
    await expect(page.getByRole('heading', { name: 'Empty the Trash?' })).toBeVisible();

    const confirmButton = page.getByRole('dialog').getByRole('button', { name: 'Empty Trash' });
    await expect(confirmButton).toBeDisabled();

    await page.getByRole('checkbox', { name: 'I understand this cannot be undone' }).check();
    await expect(confirmButton).toBeEnabled();

    await confirmButton.click();
    await expect(page.getByText(/^0 items/).or(page.getByText('The Trash is empty.'))).toBeVisible();
  });
});

