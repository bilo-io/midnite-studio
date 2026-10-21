import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 108 Theme E screenshots for the PR: the Maps capture section's Satellite/Roads layer toggles,
 * the 25 km roads warning, and the "Captured with N missing" result. Needs real layout beside the MapLibre canvas
 * and the Terrain panel, so it is a Playwright shot; behaviour is covered in vitest
 * (`map-capture-section.test.tsx`, `map-capture-section.test.tsx` (Terrain's panel is unchanged here)). `mstudio-tile:` does not exist in a
 * browser, so the style fetch is stubbed. Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/phase-108-maps-e';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const data: MockFixtures = {
  ...fixtures,
  media: { files: { 'map:maps': { 'map.json': JSON.stringify({ version: 1, basemap: 'terrain' }) } }, map: {} },
};

async function open(page: Page, theme: 'dark' | 'light', tab: 'Maps'): Promise<void> {
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
  test(`Capture layers and the roads warning (${theme})`, async ({ page }) => {
    await open(page, theme, 'Maps');
    await expect(page.getByTestId('map-capture')).toBeVisible({ timeout: 30_000 });
    await settle(page, 400);
    await page.getByTestId('map-capture').screenshot({ path: shotPath(OUT, `capture-layers-${theme}.png`) });
    await page.getByLabel('Capture side in metres').fill('30000');
    await expect(page.getByText('Roads are captured for frames up to 25 km a side.')).toBeVisible();
    await page.getByTestId('map-capture').screenshot({ path: shotPath(OUT, `capture-roads-warning-${theme}.png`) });
  });

  test(`Captured with missing layers (${theme})`, async ({ page }) => {
    await open(page, theme, 'Maps');
    await expect(page.getByTestId('map-capture')).toBeVisible({ timeout: 30_000 });
    await page.evaluate(() => {
      const api = (window as unknown as { midniteStudio: { media: { map: { capture: (r: unknown) => Promise<{ ok: boolean; value: { capture: Record<string, unknown> } }> } } } }).midniteStudio.media.map;
      const real = api.capture.bind(api);
      api.capture = async (req) => {
        const r = await real(req);
        r.value.capture['missing'] = [{ slot: 'roads', reason: "OpenStreetMap's Overpass server is busy — try again in a minute." }];
        return r;
      };
    });
    await page.getByRole('button', { name: 'Capture heightmap' }).click();
    await expect(page.getByTestId('capture-missing')).toBeVisible();
    await settle(page, 300);
    await page.getByTestId('map-capture').screenshot({ path: shotPath(OUT, `capture-missing-${theme}.png`) });
  });
}
