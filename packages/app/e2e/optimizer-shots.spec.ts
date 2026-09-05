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

const SCAN_RESULT = {
  totalBytes: 2_400_000_000,
  byCategory: {
    nodeModules: 1_800_000_000,
    buildOutput: 500_000_000,
    staleWorktree: 100_000_000,
    looseObjects: 0,
  },
  items: [
    {
      path: '/tmp/midnite-studio/node_modules',
      bytes: 1_800_000_000,
      category: 'nodeModules',
      repoId: 'repo-1',
    },
    {
      path: '/tmp/midnite-studio/packages/app/dist',
      bytes: 500_000_000,
      category: 'buildOutput',
      repoId: 'repo-1',
    },
    {
      path: '/tmp/midnite-studio/.worktrees/old-feature',
      bytes: 100_000_000,
      category: 'staleWorktree',
      repoId: 'repo-1',
    },
  ],
  truncated: false,
};

const GPU_STATS = { model: 'Apple M2 Pro', vramBytes: 16 * 1024 * 1024 * 1024, loadPercent: 42 };

const data: MockFixtures = { optimizer: { scanResult: SCAN_RESULT, gpu: GPU_STATS } };

/** Directly into the persisted store, following `seedForgeWritesConsent`'s own precedent. */
async function seedOptimizerEnabled(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const stored = localStorage.getItem('midnite-studio.ui');
    const persisted = stored ? JSON.parse(stored) : { version: 8 };
    persisted.state = { ...persisted.state, optimizerEnabled: true };
    localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
  });
}

async function openOptimizer(page: Page): Promise<void> {
  await seedOptimizerEnabled(page);
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

const tab = (page: Page, name: 'Smart Scan' | 'Storage' | 'GPU') =>
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
    await expect(page.getByText('node_modules')).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/optimizer-smart-scan-light.png` });
  });

  test('Smart Scan, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await expect(page.getByText('node_modules')).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/optimizer-smart-scan-dark.png` });
  });

  test('Storage, light', async ({ page }) => {
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await tab(page, 'Storage').click();
    await expect(page.getByRole('img', { name: 'Reclaimable storage by category' })).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/optimizer-storage-light.png` });
  });

  test('Storage, dark', async ({ page }) => {
    await goDark(page);
    await openOptimizer(page);
    await page.getByRole('button', { name: 'Run Smart Scan' }).click();
    await tab(page, 'Storage').click();
    await expect(page.getByRole('img', { name: 'Reclaimable storage by category' })).toBeVisible();
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/optimizer-storage-dark.png` });
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
});
