import { expect, test } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The Phase 47 Theme D screenshots. Not assertions — `conflict-resolution-studio.spec.ts`
 * owns those. These exist to produce the PNGs the PR embeds.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching `workflows-shots.spec.ts`.
 */
const OUT = '../../docs/screenshots/phase-47-conflict-studio';

const SETTLE_MS = 300;

const CONFLICTED_ENTRY = {
  path: 'src/config.ts',
  origPath: null,
  staged: 'unmodified',
  unstaged: 'conflicted',
  conflicted: true,
  similarity: null,
};

const TWO_REGIONS = [
  {
    segments: [
      { kind: 'context', lines: ["import { readFile } from 'node:fs';", ''] },
      {
        kind: 'conflict',
        region: {
          ours: ["const TIMEOUT_MS = 5_000;"],
          theirs: ["const TIMEOUT_MS = 10_000;"],
          base: null,
        },
      },
      { kind: 'context', lines: ['', "const RETRIES = 3;", ''] },
      {
        kind: 'conflict',
        region: {
          ours: ["export const FEATURE_FLAG = 'beta-rollout';"],
          theirs: ["export const FEATURE_FLAG = 'staged-rollout';"],
          base: null,
        },
      },
    ],
  },
];

const shots: MockFixtures = {
  ...fixtures,
  statusEntries: [CONFLICTED_ENTRY],
  inProgress: 'merge',
  conflictRegions: { 'src/config.ts': TWO_REGIONS },
};

test.describe('conflict resolution studio screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: { width: 1400, height: 900 } });

  test('the banner with a conflicted, clickable path', async ({ page }) => {
    await installMockBridge(page, shots);
    await page.goto('/graph');
    await expect(page.getByTestId('conflict-banner')).toBeVisible();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/conflict-banner.png` });
  });

  test('the Studio open for a two-region conflict', async ({ page }) => {
    await installMockBridge(page, shots);
    await page.goto('/graph');
    await page.getByTestId('conflict-banner').getByRole('button', { name: 'src/config.ts' }).click();
    await page.getByTestId('conflict-resolution-studio').getByText('2 regions left').waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/conflict-studio-two-regions.png` });
  });

  test('one region resolved, one left', async ({ page }) => {
    await installMockBridge(page, {
      ...shots,
      conflictRegions: {
        'src/config.ts': [
          {
            segments: [
              { kind: 'context', lines: ["import { readFile } from 'node:fs';", '', 'const TIMEOUT_MS = 5_000;', '', "const RETRIES = 3;", ''] },
              {
                kind: 'conflict',
                region: {
                  ours: ["export const FEATURE_FLAG = 'beta-rollout';"],
                  theirs: ["export const FEATURE_FLAG = 'staged-rollout';"],
                  base: null,
                },
              },
            ],
          },
        ],
      },
    });
    await page.goto('/graph');
    await page.getByTestId('conflict-banner').getByRole('button', { name: 'src/config.ts' }).click();
    await page.getByTestId('conflict-resolution-studio').getByText('1 region left').waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/conflict-studio-one-region-left.png` });
  });
});
