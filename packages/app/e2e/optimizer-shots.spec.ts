import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  installShotsBridge,
  SHOT_VIEWPORTS,
  type MockFixtures,
} from './shots-helper';

/**
 * The committed screenshots for Phase 59 Themes A, B, C, E — the three tabs
 * this batch built (Smart Scan, Storage, GPU), light and dark. The Memory
 * tab is Theme D, out of scope here, and ships only the "lands in a
 * follow-up phase" placeholder `optimizer-page.tsx` already shows — not a
 * real surface worth a screenshot yet.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching `workflows-shots.spec.ts`.
 */
const OUT = '../../docs/screenshots/p59-abce';
const OUT_DF = '../../docs/screenshots/p59-df';
const OUT_P73 = '../../docs/screenshots/p73-def';

// Phase 72 Theme F: at least node + rust + python, one `costly` among them —
// so the grouped list and both segmented bars (category and ecosystem) each
// have more than one real segment to render.
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

const GPU_STATS = { model: 'Apple M2 Pro', vramBytes: 16 * 1024 * 1024 * 1024, loadPercent: 42 };

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

// Phase 73 Theme E — the System section's own catalogue/scan fixtures, a
// parallel family to SCAN_RESULT above and never merged with it.
const SYSTEM_CATALOGUE = [
  { entryId: 'cargo-registry', label: 'Cargo registry', producer: 'cargo build / cargo install', ecosystem: 'rust', reclaim: 'costly' },
  { entryId: 'pnpm-store', label: 'pnpm store', producer: 'pnpm install', ecosystem: 'node', reclaim: 'costly' },
  { entryId: 'go-build-cache', label: 'Go build cache', producer: 'go build', ecosystem: 'go', reclaim: 'cheap' },
];

const SYSTEM_SCAN_RESULT = {
  totalBytes: 5_400_000_000,
  approximate: true,
  byEcosystem: { rust: 1_200_000_000, node: 4_100_000_000, go: 100_000_000 },
  items: [
    {
      path: '/Users/bilo/.cargo/registry',
      bytes: 1_200_000_000,
      approximate: false,
      entryId: 'cargo-registry',
      ecosystem: 'rust',
      reclaim: 'costly',
      label: 'Cargo registry',
      producer: 'cargo build / cargo install',
    },
    {
      path: '/Users/bilo/Library/pnpm/store/v3',
      bytes: 4_100_000_000,
      approximate: true,
      entryId: 'pnpm-store',
      ecosystem: 'node',
      reclaim: 'costly',
      label: 'pnpm store',
      producer: 'pnpm install',
    },
    {
      path: '/Users/bilo/Library/Caches/go-build',
      bytes: 100_000_000,
      approximate: false,
      entryId: 'go-build-cache',
      ecosystem: 'go',
      reclaim: 'cheap',
      label: 'Go build cache',
      producer: 'go build',
    },
  ],
};

const TRASH_SUMMARY = {
  itemCount: 42,
  totalBytes: 3_400_000_000,
  oldestModifiedAt: '2026-06-01T09:30:00.000Z',
  volumeCount: 1,
  truncated: false,
};

const data: MockFixtures = {
  optimizer: {
    scanResult: SCAN_RESULT,
    gpu: GPU_STATS,
    memory: MEMORY_BREAKDOWN,
    processes: PROCESSES,
    systemCatalogue: SYSTEM_CATALOGUE,
    systemScanResult: SYSTEM_SCAN_RESULT,
    trash: TRASH_SUMMARY,
  },
};

/**
 * Directly into the persisted store, following `seedForgeWritesConsent`'s own
 * precedent. Also seeds Phase 73 Theme C's two-factor System-cache gate on,
 * so the Storage tab's System section (Theme E) is reachable — the
 * default-off state means the un-gated shot (Storage without this section)
 * stays the common case and needs no new coverage. `trashGate` (Phase 74
 * Theme D/E) additionally seeds `allowTrashEmpty`/`trashEmptyConsentGiven` so
 * the Trash card's shot doesn't have to choreograph the settings-page
 * consent flow first.
 */
async function seedOptimizerEnabled(page: Page, opts: { trashGate?: boolean } = {}): Promise<void> {
  await page.addInitScript((trashGate: boolean) => {
    const stored = localStorage.getItem('midnite-studio.ui');
    const persisted = stored ? JSON.parse(stored) : { version: 9 };
    persisted.state = {
      ...persisted.state,
      optimizerEnabled: true,
      allowSystemCacheClean: true,
      systemCacheConsentGiven: true,
      ...(trashGate ? { allowTrashEmpty: true, trashEmptyConsentGiven: true } : {}),
    };
    localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
  }, opts.trashGate ?? false);
}

async function openOptimizer(page: Page, opts: { trashGate?: boolean } = {}): Promise<void> {
  await seedOptimizerEnabled(page, opts);
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

const tab = (page: Page, name: 'Smart Scan' | 'Storage' | 'Memory' | 'GPU') =>
  page.getByRole('navigation', { name: 'Optimizer tabs' }).getByRole('button', { name, exact: true });

/** Same two-step dark sequence every `*-shots.spec.ts` dark case uses: emulate BEFORE navigation (persists across it), add the class AFTER (needs the loaded document). */
async function goDark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
}
async function paintDark(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
}

const SETTLE_MS = 300;

test.describe('optimizer screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.default });

  test('Smart Scan, light', async ({ page }) => {
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await expect(page.getByText('Dependencies')).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/optimizer-smart-scan-light.png` });
  });

  test('Smart Scan, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await expect(page.getByText('Dependencies')).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/optimizer-smart-scan-dark.png` });
  });

  test('Storage, light', async ({ page }) => {
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await tab(page, 'Storage').click();
    await expect(
      page.getByRole('img', { name: 'Reclaimable storage by ecosystem' }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: 'Reclaimable storage by category' })).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/optimizer-storage-light.png` });
  });

  test('Storage, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await tab(page, 'Storage').click();
    await expect(
      page.getByRole('img', { name: 'Reclaimable storage by ecosystem' }),
    ).toBeVisible();
    await expect(page.getByRole('img', { name: 'Reclaimable storage by category' })).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/optimizer-storage-dark.png` });
  });

  test('System caches, light', async ({ page }) => {
    await openOptimizer(page);
    await tab(page, 'Storage').click();
    await page.getByRole('button', { name: 'Scan system caches' }).click();
    await expect(page.getByText('Cargo registry')).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT_P73}/optimizer-system-caches-light.png` });
  });

  test('System caches, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await tab(page, 'Storage').click();
    await page.getByRole('button', { name: 'Scan system caches' }).click();
    await expect(page.getByText('Cargo registry')).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT_P73}/optimizer-system-caches-dark.png` });
  });

  test('Memory, light', async ({ page }) => {
    await openOptimizer(page);
    await tab(page, 'Memory').click();
    await expect(page.getByText('Memory Used')).toBeVisible();
    await expect(page.getByText('claude', { exact: true })).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT_DF}/optimizer-memory-light.png` });
  });

  test('Memory, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await tab(page, 'Memory').click();
    await expect(page.getByText('Memory Used')).toBeVisible();
    await expect(page.getByText('claude', { exact: true })).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT_DF}/optimizer-memory-dark.png` });
  });

  test('GPU, light', async ({ page }) => {
    await openOptimizer(page);
    await tab(page, 'GPU').click();
    await expect(page.getByText('Apple M2 Pro')).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/optimizer-gpu-light.png` });
  });

  test('GPU, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await tab(page, 'GPU').click();
    await expect(page.getByText('Apple M2 Pro')).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/optimizer-gpu-dark.png` });
  });

  // Phase 74 Theme D — the Trash card's has-items state, gate on.
  test('Storage — Trash card, light', async ({ page }) => {
    await openOptimizer(page, { trashGate: true });
    await tab(page, 'Storage').click();
    await page.getByRole('button', { name: 'Check Trash' }).click();
    await expect(page.getByText(/^42 items/)).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT_DF}/optimizer-storage-trash-light.png` });
  });

  test('Storage — Trash card, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page, { trashGate: true });
    await tab(page, 'Storage').click();
    await page.getByRole('button', { name: 'Check Trash' }).click();
    await expect(page.getByText(/^42 items/)).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT_DF}/optimizer-storage-trash-dark.png` });
  });
});
