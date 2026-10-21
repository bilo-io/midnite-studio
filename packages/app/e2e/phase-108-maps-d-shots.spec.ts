import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 108 Theme D screenshots for the PR: the "Capture heightmap" section of the Maps detail pane —
 * idle, over Terrain's size cap (blocked, with its warning), and after a capture. Needs real layout and
 * the MapLibre canvas beside it, so it is a Playwright shot; behaviour is covered in vitest
 * (`map-capture-section.test.tsx`, `capture-service.test.ts`). `mstudio-tile:` does not exist in a
 * browser, so the style fetch is stubbed. Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/phase-108-maps-d';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const data: MockFixtures = { ...fixtures, media: { files: { 'map:maps': { 'map.json': JSON.stringify({ version: 1, basemap: 'terrain' }) } }, map: {} } };

async function openMaps(page: Page, theme: 'dark' | 'light'): Promise<void> {
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
    await page.getByRole('tab', { name: 'Maps' }).click();
    await expect(page.getByRole('tab', { name: 'Maps', selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await expect(page.getByTestId('map-capture')).toBeVisible({ timeout: 30_000 });
}

for (const theme of ['dark', 'light'] as const) {
  test(`Capture heightmap (${theme})`, async ({ page }) => {
    await openMaps(page, theme);
    await settle(page, 400);
    await page.getByTestId('map-capture').screenshot({ path: shotPath(OUT, `capture-idle-${theme}.png`) });

    await page.getByLabel('Capture side in metres').fill('70000');
    await expect(page.getByTestId('map-capture').getByRole('status')).toBeVisible();
    await page.getByTestId('map-capture').screenshot({ path: shotPath(OUT, `capture-over-cap-${theme}.png`) });

    await page.getByLabel('Capture side in metres').fill('12000');
    await page.getByLabel('Capture output size').selectOption('2049');
    await page.getByRole('button', { name: 'Capture heightmap' }).click();
    await expect(page.getByTestId('capture-done')).toBeVisible();
    await page.getByTestId('map-capture').screenshot({ path: shotPath(OUT, `capture-done-${theme}.png`) });
  });
}
