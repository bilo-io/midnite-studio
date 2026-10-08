import { expect, test, type Page } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  setTheme,
  settle,
  SHOT_VIEWPORTS,
  shotPath,
} from './shots-helper';

const OUT = '../../docs/screenshots/adhoc-map-export-layer-status';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: { 'map:maps': { 'map.json': JSON.stringify({ version: 1, basemap: 'terrain' }) } },
    map: {},
  },
};

async function openMaps(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await page.addInitScript((dark) => {
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('mstudio-tile://')) {
        const style = {
          version: 8,
          sources: {},
          layers: [{ id: 'background', type: 'background', paint: { 'background-color': dark ? '#1f2a36' : '#dfe8ee' } }],
        };
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
    await page.getByRole('tab', { name: 'Maps' }).click();
    await expect(page.getByRole('tab', { name: 'Maps', selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await expect(page.getByTestId('map-capture')).toBeVisible({ timeout: 30_000 });
}

for (const theme of ['dark', 'light'] as const) {
  test(`Capture export layer status (${theme})`, async ({ page }) => {
    await openMaps(page, theme);
    await settle(page, 400);

    // Click Capture heightmap
    await page.getByRole('button', { name: 'Capture heightmap' }).click();
    await expect(page.getByTestId('capture-done')).toBeVisible();
    await expect(page.getByTestId('map-export-layers')).toBeVisible();

    await settle(page, 200);

    // Screenshot of the whole capture section
    await page.getByTestId('map-capture').screenshot({
      path: shotPath(OUT, `map-capture-${theme}.png`),
    });

    // Screenshot focused specifically on the export layers list
    await page.getByTestId('map-export-layers').screenshot({
      path: shotPath(OUT, `export-layers-${theme}.png`),
    });
  });
}
