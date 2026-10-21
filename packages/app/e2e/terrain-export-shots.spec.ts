import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, installShotsBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 105 Themes I + J screenshots for the PR: the Terrain export bar with its glb options, and
 * Settings ▸ MCP with the new terrain switch. Run with `MSTUDIO_SHOTS=1`; skipped
 * otherwise. Playwright is only needed here to take pictures — the behaviour is covered in vitest
 * (`terrain-tab.bridge.test.tsx`).
 */
const OUT = '../../docs/screenshots/terrain-export';

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


test('export bar with glb options (dark)', async ({ page }) => {
  const built = spec({
    inputs: { heightmap: input('heightmap', 'dunes-height-16bit.png', 1024, 1024, 16), satellite: input('satellite', 'dunes-satellite.jpg', 2048, 2048, 8) },
    lastBuild: { at: '2026-10-04T12:00:00.000Z', buildMs: stats.buildMs, stats },
  });
  await openTerrain(page, 'dark', built);
  const bar = page.getByRole('group', { name: 'GLB export options' });
  await expect(bar).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'terrain-export-bar-dark.png') });
});

test('Settings MCP terrain switch (dark)', async ({ page }) => {
  await installShotsBridge(page, { mcp: { enabled: true } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'MCP Server' }).click();
  await page.getByRole('button', { name: /Let agents edit terrains/ }).first().click();
  await setTheme(page, 'dark', { settleMs: 300 });
  await page.getByText('Let agents edit terrains').last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: shotPath(OUT, 'settings-mcp-terrains-dark.png') });
});
