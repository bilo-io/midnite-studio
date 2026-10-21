import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 108 Theme C screenshots for the PR: the Maps tab with the capture frame drawn over the canvas, the
 * 3D/Frame toolbar, and the capture panel's readout, size picker and warnings. Needs real WebGL and layout (the
 * canvas), so it is a Playwright shot, not a vitest. `mstudio-tile:` does not exist in a browser, so the
 * style fetch is stubbed to a flat background; tiles themselves are never exercised here. Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise. Behaviour is covered in vitest under `features/media/map/`.
 */
const OUT = '../../docs/screenshots/phase-108-maps-c';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const data: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'map:maps': {
        'map.json': JSON.stringify({
          version: 1,
          basemap: 'terrain',
          view: { center: [18.4241, -33.9249], zoom: 11, bearing: 0, pitch: 0 },
          terrain3d: { on: true, exaggeration: 2 },
          frame: { center: [18.4241, -33.9249], sideM: 12000, size: 1025 },
        }),
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
        const style = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': dark ? '#1f2a36' : '#dfe8ee' } }] };
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
}

for (const theme of ['dark', 'light'] as const) {
  test(`Maps capture frame (${theme})`, async ({ page }) => {
    await openMaps(page, theme);
    await expect(page.getByTestId('frame-readout')).toBeVisible();
    await settle(page, 1200);
    await page.screenshot({ path: shotPath(OUT, `maps-frame-${theme}.png`) });
  });
}
