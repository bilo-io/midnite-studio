import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 105 Themes A + B screenshots for the PR: the Terrain tab with its three optional inputs, a
 * built terrain's summary, and the no-height-source report. Run with `MSTUDIO_SHOTS=1`; skipped
 * otherwise. Playwright is only needed here to take pictures — the behaviour is covered in vitest
 * (`terrain-tab.bridge.test.tsx`).
 */
const OUT = '../../docs/screenshots/phase-105-terrain-ab';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const input = (slot: string, sourceName: string, width: number, height: number, bitDepth: 8 | 16) => ({
  file: `inputs/${slot}.png`,
  sourceName,
  width,
  height,
  bitDepth,
});

const stats = {
  resolution: 1025,
  worldSize: 2048,
  vertexCount: 1050625,
  triangleCount: 2097152,
  chunkCount: 256,
  lodCount: 4,
  buildMs: 1840,
  minHeight: 0,
  maxHeight: 312.4,
  histogram: [820, 1900, 4100, 9100, 15200, 22000, 31000, 40100, 52000, 61000, 70500, 83000, 99000, 120500, 160000, 280000],
  warnings: ['Non-square heightmap stretched to a square extent.'],
};

const spec = (extra: Record<string, unknown>) =>
  JSON.stringify({ version: 1, name: 'Dunes', resolution: 1025, worldSize: 2048, heightRange: [0, 320], inputs: {}, ...extra });

const data = (terrainSpec: string): MockFixtures => ({
  ...fixtures,
  media: {
    files: {
      'terrain:terrains': {
        'dunes-20261004-120000/terrain.json': terrainSpec,
        'ridge-20261003-093000/terrain.json': spec({ name: 'Ridge' }),
      },
      'terrain:islands': { 'atoll-20261001-101500/terrain.json': spec({ name: 'Atoll' }) },
    },
    terrain: { stats },
  },
});

async function openTerrain(page: Page, theme: 'dark' | 'light', terrainSpec: string): Promise<void> {
  await installMockBridge(page, data(terrainSpec));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Terrain' }).click();
    await expect(page.getByRole('tab', { name: 'Terrain', selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, theme, { settleMs: 200 });
  const explorer = page.locator('[data-media-pane="explorer"]');
  await explorer.getByRole('button', { name: 'dunes' }).click();
  await expect(page.getByTestId('terrain-panel')).toBeVisible();
}

for (const theme of ['dark', 'light'] as const) {
  test(`empty inputs (${theme})`, async ({ page }) => {
    await openTerrain(page, theme, spec({}));
    await settle(page, 400);
    await page.screenshot({ path: shotPath(OUT, `terrain-empty-${theme}.png`) });
  });
}

test('built terrain with two inputs (dark)', async ({ page }) => {
  const built = spec({
    inputs: { heightmap: input('heightmap', 'dunes-height-16bit.png', 1024, 1024, 16), satellite: input('satellite', 'dunes-satellite.jpg', 2048, 2048, 8) },
    lastBuild: { at: '2026-10-04T12:00:00.000Z', buildMs: stats.buildMs, stats },
  });
  await openTerrain(page, 'dark', built);
  await expect(page.getByTestId('terrain-summary')).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'terrain-built-dark.png') });
});

test('Generate with no height source reports it (dark)', async ({ page }) => {
  await openTerrain(page, 'dark', spec({}));
  await page.getByTestId('terrain-panel').getByRole('button', { name: 'Generate' }).click();
  await expect(page.getByText(/No heightmap attached/)).toBeVisible();
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'terrain-no-height-source-dark.png') });
});
