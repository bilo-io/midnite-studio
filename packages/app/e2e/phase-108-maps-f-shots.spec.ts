import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 108 Theme F screenshots for the PR: the Maps capture section's three buttons and its hand-off
 * result, and the Terrain panel's "Captured from Maps" row. Needs real layout beside the MapLibre canvas
 * and the Terrain panel, so it is a Playwright shot; behaviour is covered in vitest
 * (`map-capture-section.test.tsx`, `terrain-panel.bridge.test.tsx`). `mstudio-tile:` does not exist in a
 * browser, so the style fetch is stubbed. Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/phase-108-maps-f';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const geo = {
  center: [18.4241, -33.9249],
  bbox: [18.38, -33.96, 18.47, -33.89],
  sideM: 8000,
  capture: { project: 'maps', name: 'cape-town-20260101-000000' },
  attributions: ['Terrain Tiles: Mapzen, AWS Open Data'],
  capturedAt: '2026-01-01T00:00:00.000Z',
};
const terrainSpec = JSON.stringify({
  version: 1,
  name: 'Cape Town',
  resolution: 1025,
  worldSize: 8000,
  heightRange: [-4, 1086],
  seaLevel: 0,
  textureSize: 2048,
  inputs: { heightmap: { file: 'inputs/heightmap.png', sourceName: 'heightmap.png', width: 1025, height: 1025, bitDepth: 16 } },
  geo,
});
const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'map:maps': { 'map.json': JSON.stringify({ version: 1, basemap: 'terrain' }) },
      'terrain:terrains': { 'cape-town-20260101-000000/terrain.json': terrainSpec },
    },
    map: {},
  },
};

async function open(page: Page, theme: 'dark' | 'light', tab: 'Maps' | 'Terrain'): Promise<void> {
  await page.addInitScript((dark) => {
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('mstudio-tile://')) {
        const style = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': dark ? '#1f2a36' : '#dfe8ee' } }] };
        return Promise.resolve(new Response(JSON.stringify(style), { headers: { 'Content-Type': 'application/json' } }));
      }
      return real(input, init);
    };
  }, theme === 'dark');
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab, selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, theme, { settleMs: 200 });
}

for (const theme of ['dark', 'light'] as const) {
  test(`Capture for Terrain buttons and hand-off (${theme})`, async ({ page }) => {
    await open(page, theme, 'Maps');
    await expect(page.getByTestId('map-capture')).toBeVisible({ timeout: 30_000 });
    await settle(page, 400);
    await page.getByTestId('map-capture').screenshot({ path: shotPath(OUT, `capture-buttons-${theme}.png`) });
    await page.getByRole('button', { name: 'Capture and build' }).click();
    await expect(page.getByTestId('capture-terrain')).toBeVisible();
    await page.getByTestId('map-capture').screenshot({ path: shotPath(OUT, `capture-handed-off-${theme}.png`) });
  });

  test(`Terrain panel Captured from Maps row (${theme})`, async ({ page }) => {
    await open(page, theme, 'Terrain');
    await page.locator('[data-media-pane="explorer"]').getByRole('button', { name: 'cape-town' }).click();
    await expect(page.getByTestId('terrain-geo')).toBeVisible();
    await settle(page, 400);
    await page.getByTestId('terrain-panel').screenshot({ path: shotPath(OUT, `terrain-geo-${theme}.png`) });
  });
}
