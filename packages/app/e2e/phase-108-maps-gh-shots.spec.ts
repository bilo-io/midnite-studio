import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 108 Themes G and H screenshots for the PR: a distance path mid-draw with its geodesic readout, and
 * the layers (visibility, colour, an invalid file's error row) with a selected circle and the second-circle
 * "centre to centre" readout. Needs real WebGL, layout and pointer clicks on the canvas, so it is a
 * Playwright shot. `mstudio-tile:` does not exist in a browser, so the style fetch is stubbed to a flat
 * background. Run with `MSTUDIO_SHOTS=1`; skipped otherwise. Behaviour is covered in vitest under
 * `features/media/map/`.
 */
const OUT = '../../docs/screenshots/phase-108-maps-gh';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const CENTER: [number, number] = [18.4241, -33.9249];

/** An approximate circle (fixture only — the app builds real geodesic ones). */
function disc(center: [number, number], radiusM: number): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i += 1) {
    const a = (i / 64) * Math.PI * 2;
    ring.push([center[0] + (Math.cos(a) * radiusM) / (111_320 * Math.cos((center[1] * Math.PI) / 180)), center[1] + (Math.sin(a) * radiusM) / 110_540]);
  }
  return ring;
}

const circle = (id: string, center: [number, number], radiusM: number, label: string) => ({
  type: 'Feature',
  id,
  geometry: { type: 'Polygon', coordinates: [disc(center, radiusM)] },
  properties: { kind: 'circle', label, center, radiusM },
});

const layerFile = (features: unknown[]) => JSON.stringify({ type: 'FeatureCollection', features });

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'map:maps': {
        'map.json': JSON.stringify({
          version: 1,
          basemap: 'streets',
          view: { center: CENTER, zoom: 11.6, bearing: 0, pitch: 0 },
          layerOrder: ['zones', 'routes', 'broken'],
          layerStyle: { zones: { color: '#8b5cf6', visible: true }, routes: { color: '#10b981', visible: true }, broken: { color: '#ef4444', visible: true } },
        }),
        'layers/zones.geojson': layerFile([
          circle('c1', [18.38, -33.93], 3000, '3 km zone'),
          circle('c2', [18.47, -33.9], 2500, '2.5 km zone'),
          { type: 'Feature', id: 'a1', geometry: { type: 'Polygon', coordinates: [[[18.40, -33.99], [18.5, -33.99], [18.5, -33.95], [18.42, -33.94], [18.40, -33.99]]] }, properties: { kind: 'area', label: 'Plot' } },
        ]),
        'layers/routes.geojson': layerFile([
          { type: 'Feature', id: 'p1', geometry: { type: 'LineString', coordinates: [[18.36, -33.88], [18.42, -33.91], [18.5, -33.86]] }, properties: { kind: 'path', label: 'Ride' } },
          { type: 'Feature', id: 'n1', geometry: { type: 'Point', coordinates: [18.4036, -33.9628] }, properties: { kind: 'pin', label: 'Table Mountain', note: 'Flat top' } },
        ]),
        'layers/broken.geojson': '{ not json',
      },
    },
  },
};

async function stubStyles(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.addInitScript((dark) => {
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('mstudio-tile://')) {
        const style = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': dark ? '#1f2a36' : '#e7eef3' } }] };
        return Promise.resolve(new Response(JSON.stringify(style), { headers: { 'Content-Type': 'application/json' } }));
      }
      return real(input, init);
    };
  }, theme === 'dark');
}

async function openMaps(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await stubStyles(page, theme);
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Maps' }).click();
    await expect(page.getByRole('tab', { name: 'Maps', selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await expect(page.getByTestId('map-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Layer zones')).toBeVisible({ timeout: 15_000 });
}

for (const theme of ['dark', 'light'] as const) {
  test(`Maps distance tool mid-draw (${theme})`, async ({ page }) => {
    await openMaps(page, theme);
    await page.getByRole('button', { name: 'Distance (D)' }).click();
    const box = (await page.getByTestId('map-canvas').boundingBox())!;
    for (const [fx, fy] of [[0.3, 0.7], [0.45, 0.45], [0.62, 0.55], [0.75, 0.3]] as const) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await page.waitForTimeout(120);
    }
    await expect(page.getByTestId('measure-readout')).toContainText('Total (geodesic)');
    await settle(page, 900);
    await page.screenshot({ path: shotPath(OUT, `maps-distance-${theme}.png`) });
  });

  test(`Maps layers and a circle pair (${theme})`, async ({ page }) => {
    await openMaps(page, theme);
    await expect(page.getByText('Not valid GeoJSON — fix the file or delete the layer.')).toBeVisible();
    const box = (await page.getByTestId('map-canvas').boundingBox())!;
    // Pick both circles (shift-click the second): the centres sit west and east of the view centre.
    const pick = async (fx: number, fy: number, shift: boolean) => {
      await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
      if (shift) await page.keyboard.down('Shift');
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      if (shift) await page.keyboard.up('Shift');
    };
    await settle(page, 600);
    await pick(0.21, 0.53, false);
    await pick(0.8, 0.34, true);
    await expect(page.getByTestId('circle-pair')).toContainText('Centre to centre:');
    await settle(page, 900);
    await page.screenshot({ path: shotPath(OUT, `maps-layers-${theme}.png`) });
  });
}
