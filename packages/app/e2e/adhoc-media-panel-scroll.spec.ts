import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, shotPath } from './shots-helper';

/**
 * Media detail pane scrolls and keeps its composer pinned (adhoc-media-panel-scroll).
 *
 * Needs a real browser: `scrollHeight > clientHeight` and `getBoundingClientRect()` only mean something
 * under real layout (jsdom has no geometry). The class structure (scroll body, non-scrolling footer)
 * is vitest in `media-panel-layout.test.tsx`; this proves the layout actually behaves on a short window.
 * Screenshots (Images, Maps) are written only with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/adhoc-media-panel-scroll';
const data: MockFixtures = {
  ...fixtures,
  media: { files: { 'map:maps': { 'map.json': JSON.stringify({ version: 1, basemap: 'terrain' }) } }, map: {} },
};

test.describe.configure({ timeout: 90_000 });
test.use({ viewport: { width: 1280, height: 380 } });

async function openTab(page: Page, tab: 'Images' | 'Maps'): Promise<void> {
  await page.addInitScript(() => {
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('mstudio-tile://')) {
        const style = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#1f2a36' } }] };
        return Promise.resolve(new Response(JSON.stringify(style), { headers: { 'Content-Type': 'application/json' } }));
      }
      return real(input, init);
    };
  });
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab, selected: true })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
}

test('Images: short window — the body scrolls and the composer stays at the panel bottom', async ({ page }) => {
  await openTab(page, 'Images');
  const pane = page.locator('[data-media-pane="detail"]');
  const body = pane.locator('[data-media-panel-body]');
  const footer = pane.locator('[data-media-panel-footer]');
  await expect(footer).toBeVisible();

  const overflow = await body.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(overflow.scroll).toBeGreaterThan(overflow.client);

  const paneBox = (await pane.boundingBox())!;
  const before = (await footer.boundingBox())!;
  expect(Math.abs(before.y + before.height - (paneBox.y + paneBox.height))).toBeLessThanOrEqual(2);
  const composer = page.getByRole('textbox', { name: 'Prompt' });
  const composerBox = (await composer.boundingBox())!;
  expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(paneBox.y + paneBox.height + 1);

  await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const after = (await footer.boundingBox())!;
  expect(Math.round(after.y)).toBe(Math.round(before.y));
  expect(Math.round(after.height)).toBe(Math.round(before.height));

  if (process.env['MSTUDIO_SHOTS']) {
    await pane.screenshot({ path: shotPath(OUT, 'images-scrolled-composer-pinned.png') });
    await page.screenshot({ path: shotPath(OUT, 'images-window.png') });
  }
});

test('Maps: short window — the panel scrolls', async ({ page }) => {
  test.skip(!process.env['MSTUDIO_SHOTS'], 'screenshot only; Maps has no composer');
  await openTab(page, 'Maps');
  const panel = page.getByTestId('map-panel');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  const overflow = await panel.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
  expect(overflow.scroll).toBeGreaterThan(overflow.client);
  await panel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.screenshot({ path: shotPath(OUT, 'maps-window-scrolled.png') });
});
