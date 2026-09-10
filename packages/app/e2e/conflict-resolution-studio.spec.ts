import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * The Conflict Resolution Studio (Phase 47 Theme D), end to end.
 *
 * Phase 82 Theme C wave 5 moved every other test here to
 * `src/features/conflicts/conflict-resolution-studio.bridge.test.tsx`,
 * assembling `ConflictBanner` + `ConflictResolutionStudio` through a small
 * harness (mirroring the slice of `graph-view.tsx` that wires them together)
 * rather than the whole `GraphView`. Every one of those assertions — the
 * banner's path list opening the Studio, `ops.conflictApplyHunk`/
 * `conflictResolveWholeFile` actually firing, "Suggest a resolution" round-
 * tripping through the council mock — turned out not to need a real browser.
 * One smoke test stays here, proving the same chain also holds through a real
 * page load and the real `/graph` route, which the jsdom harness does not
 * exercise.
 */
const CONFLICTED_ENTRY = {
  path: 'src/f.txt',
  origPath: null,
  staged: 'unmodified',
  unstaged: 'conflicted',
  conflicted: true,
  similarity: null,
};

const TWO_REGIONS = [
  {
    segments: [
      { kind: 'context', lines: ['shared line'] },
      { kind: 'conflict', region: { ours: ['MAIN1'], theirs: ['FEAT1'], base: null } },
      { kind: 'context', lines: ['middle'] },
      { kind: 'conflict', region: { ours: ['MAIN2'], theirs: ['FEAT2'], base: null } },
    ],
  },
];

const base: MockFixtures = {
  ...fixtures,
  statusEntries: [CONFLICTED_ENTRY],
  inProgress: 'merge',
  conflictRegions: { 'src/f.txt': TWO_REGIONS },
};

const open = async (page: Page, data: MockFixtures = base): Promise<void> => {
  await installMockBridge(page, data);
  await page.goto('/graph');
  await expect(page.getByTestId('conflict-banner').getByText('Merge in progress')).toBeVisible();
};

test('the conflicted path in the banner opens the Studio, showing every region', async ({ page }) => {
  await open(page);

  await page.getByTestId('conflict-banner').getByRole('button', { name: 'src/f.txt' }).click();

  const studio = page.getByTestId('conflict-resolution-studio');
  await expect(studio).toBeVisible();
  await expect(studio.getByText('2 regions left')).toBeVisible();
  await expect(studio.getByText('shared line')).toBeVisible();
  await expect(studio.getByText('MAIN1')).toBeVisible();
  await expect(studio.getByText('FEAT1')).toBeVisible();
  await expect(studio.getByText('MAIN2')).toBeVisible();
});
