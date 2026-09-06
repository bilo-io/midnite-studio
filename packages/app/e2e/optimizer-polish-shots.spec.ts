import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, installShotsBridge, SHOT_VIEWPORTS, type MockFixtures } from './shots-helper';

/**
 * Screenshots for the ad-hoc Optimizer polish pass: Smart Scan's large
 * drifting hero and its accordion results, Storage's facet pills + tree, the
 * sortable Memory table with its glowing Terminate, and the new System tab.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts`.
 */
const OUT = '../../docs/screenshots/adhoc-optimizer-polish';

const SCAN_RESULT = {
  totalBytes: 2_750_000_000,
  byCategory: {
    dependencies: 1_800_000_000,
    buildOutput: 800_000_000,
    toolCache: 50_000_000,
    staleWorktree: 100_000_000,
    looseObjects: 0,
  },
  byEcosystem: {
    node: 2_300_000_000,
    multi: 0,
    rust: 300_000_000,
    cpp: 0,
    dotnet: 0,
    python: 50_000_000,
    java: 0,
    swift: 0,
    ruby: 0,
    go: 0,
    media: 0,
    git: 100_000_000,
  },
  detectors: {
    'node-modules': { label: 'node_modules', producer: 'npm/pnpm/yarn install' },
    'node-dist': { label: 'dist/', producer: 'npm run build' },
    'rust-target': { label: 'target/ (Cargo)', producer: 'cargo build' },
    'py-pytest-cache': { label: '.pytest_cache/', producer: 'pytest' },
    'git-stale-worktree': { label: 'Stale worktree', producer: 'git worktree add' },
  },
  items: [
    {
      path: '/tmp/midnite-studio/node_modules',
      bytes: 1_800_000_000,
      category: 'dependencies',
      repoId: 'repo-1',
      detectorId: 'node-modules',
      ecosystem: 'node',
      reclaim: 'costly',
    },
    {
      path: '/tmp/midnite-studio/packages/app/dist',
      bytes: 500_000_000,
      category: 'buildOutput',
      repoId: 'repo-1',
      detectorId: 'node-dist',
      ecosystem: 'node',
      reclaim: 'cheap',
    },
    {
      path: '/tmp/midnite-studio/packages/desktop/dist',
      bytes: 200_000_000,
      category: 'buildOutput',
      repoId: 'repo-1',
      detectorId: 'node-dist',
      ecosystem: 'node',
      reclaim: 'cheap',
    },
    {
      path: '/tmp/midnite-studio/vendor/rust-tool/target',
      bytes: 300_000_000,
      category: 'buildOutput',
      repoId: 'repo-1',
      detectorId: 'rust-target',
      ecosystem: 'rust',
      reclaim: 'cheap',
    },
    {
      path: '/tmp/midnite-studio/scripts/.pytest_cache',
      bytes: 50_000_000,
      category: 'toolCache',
      repoId: 'repo-1',
      detectorId: 'py-pytest-cache',
      ecosystem: 'python',
      reclaim: 'cheap',
    },
    {
      path: '/tmp/midnite-studio/.worktrees/old-feature',
      bytes: 100_000_000,
      category: 'staleWorktree',
      repoId: 'repo-1',
      detectorId: 'git-stale-worktree',
      ecosystem: 'git',
      reclaim: 'cheap',
    },
  ],
  truncated: false,
  truncatedRoots: [],
};

const MEMORY_BREAKDOWN = {
  totalBytes: 32 * 1024 * 1024 * 1024,
  usedBytes: 18 * 1024 * 1024 * 1024,
  wiredBytes: 4 * 1024 * 1024 * 1024,
  activeBytes: 9 * 1024 * 1024 * 1024,
  compressedBytes: 2 * 1024 * 1024 * 1024,
  cachedBytes: 3 * 1024 * 1024 * 1024,
  freeBytes: 14 * 1024 * 1024 * 1024,
};

const PROCESSES = [
  {
    pid: 48210,
    ppid: 1,
    name: 'claude',
    argv: 'claude --session-id ses-391a --model opus',
    rssBytes: 1_240_000_000,
    cpuPercent: 18.4,
    ours: true,
  },
  {
    pid: 48215,
    ppid: 1,
    name: 'node vite',
    argv: 'node /Users/bilo/Dev/midnite-studio/node_modules/vite/bin/vite.js',
    rssBytes: 680_000_000,
    cpuPercent: 2.1,
    ours: true,
  },
  {
    pid: 3102,
    ppid: 1,
    name: 'zsh',
    argv: 'zsh -l',
    rssBytes: 45_000_000,
    cpuPercent: 0.0,
    ours: true,
  },
  {
    pid: 198,
    ppid: 1,
    name: 'WindowServer',
    argv: '/System/Library/CoreServices/WindowServer -display',
    rssBytes: 1_450_000_000,
    cpuPercent: 14.8,
    ours: false,
  },
];

/**
 * Enough samples for the 15-minute charts to have a shape rather than a
 * two-point line. Spaced 30s apart so the whole window is covered, with the
 * three series deliberately out of phase — a chart where CPU and RAM move
 * together would hide exactly the disagreement these charts exist to show.
 */
const METRICS_SAMPLES = Array.from({ length: 30 }, (_, i) => ({
  at: i * 30_000,
  cpu: Math.round(38 + 28 * Math.sin(i / 3.1)),
  memory: Math.round(55 + 12 * Math.sin(i / 5.3 + 1.2)),
  gpu: Math.round(30 + 22 * Math.sin(i / 2.2 + 2.4)),
  disk: 68,
  memoryBytes: { used: 18 * 1024 ** 3, total: 32 * 1024 ** 3 },
  diskBytes: { used: 680 * 1024 ** 3, total: 1000 * 1024 ** 3 },
  cpuInfo: { cores: 12 },
}));

const data: MockFixtures = {
  metricsSamples: METRICS_SAMPLES,
  optimizer: {
    scanResult: SCAN_RESULT,
    gpu: { model: 'Apple M2 Pro', vramBytes: 16 * 1024 * 1024 * 1024, loadPercent: 42 },
    memory: MEMORY_BREAKDOWN,
    processes: PROCESSES,
  },
};

async function openOptimizer(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stored = localStorage.getItem('midnite-studio.ui');
    const persisted = stored ? JSON.parse(stored) : { version: 9 };
    persisted.state = { ...persisted.state, optimizerEnabled: true };
    localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
  });
  await installShotsBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(async () => {
    await clickRailLink(page, 'Optimizer');
    await expect(page.getByRole('heading', { name: 'Workspace Optimizer' })).toBeVisible({
      timeout: 2000,
    });
  }).toPass({ timeout: 12000 });
}

const tab = (page: Page, name: 'Smart Scan' | 'Storage' | 'Memory' | 'System' | 'GPU') =>
  page.getByRole('navigation', { name: 'Optimizer tabs' }).getByRole('button', { name, exact: true });

async function goDark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
}
async function paintDark(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
}

const SETTLE_MS = 400;

test.describe('optimizer polish screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.default });

  test('Smart Scan — the empty hero, light', async ({ page }) => {
    await openOptimizer(page);
    await expect(page.getByRole('button', { name: 'Run Smart Scan' })).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/smart-scan-empty-light.png` });
  });

  test('Smart Scan — the empty hero, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await expect(page.getByRole('button', { name: 'Run Smart Scan' })).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/smart-scan-empty-dark.png` });
  });

  test('Smart Scan — accordion results, light', async ({ page }) => {
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await expect(page.getByText('Scan complete')).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/smart-scan-results-light.png` });
  });

  test('Smart Scan — accordion results, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await expect(page.getByText('Scan complete')).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/smart-scan-results-dark.png` });
  });

  test('Storage — pills and the tree, light', async ({ page }) => {
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await tab(page, 'Storage').click();
    await expect(page.getByRole('img', { name: 'Reclaimable storage by ecosystem' })).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/storage-tree-light.png` });
  });

  test('Storage — pills and the tree, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await tab(page, 'Storage').click();
    await expect(page.getByRole('img', { name: 'Reclaimable storage by ecosystem' })).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/storage-tree-dark.png` });
  });

  test('Storage — a facet pressed and a query typed, light', async ({ page }) => {
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await tab(page, 'Storage').click();
    await page.getByRole('button', { name: /^Node/ }).click();
    await page.getByPlaceholder('Filter by path or kind…').fill('dist');
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/storage-filtered-light.png` });
  });

  test('Memory — sorted table and the charts, light', async ({ page }) => {
    await openOptimizer(page);
    await tab(page, 'Memory').click();
    await expect(page.getByText('Memory Used')).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/memory-sorted-light.png` });
  });

  test('Memory — Terminate hovered, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await tab(page, 'Memory').click();
    await expect(page.getByText('Memory Used')).toBeVisible();
    await paintDark(page);
    const terminate = page.getByRole('button', { name: 'Terminate' }).first();
    await terminate.scrollIntoViewIfNeeded();
    // `force`: the tab's own scroll container sits over the row's right edge
    // and intercepts the pointer, but the CSS `:hover` this shot exists to
    // capture only needs the mouse moved there.
    await terminate.hover({ force: true });
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/memory-terminate-hover-dark.png` });
  });

  test('System — the long-window charts, light', async ({ page }) => {
    await openOptimizer(page);
    await tab(page, 'System').click();
    await expect(page.getByRole('img', { name: /CPU over the last/ })).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/system-tab-light.png` });
  });

  test('System — the long-window charts, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await tab(page, 'System').click();
    await expect(page.getByRole('img', { name: /CPU over the last/ })).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/system-tab-dark.png` });
  });
});
