/**
 * media-dark — Media ▸ Library, the personal media server: the Films grid with
 * a Continue watching row, a title's detail pane, a show's episodes, an album's
 * tracks, then the Photos grid and one photo.
 *
 * The mock bridge has no `media.library`, so `libraryInit` adds a seeded one,
 * and the art (rendered by `fixtures/media-art.mjs`) is served off the dev
 * server through `page.route`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, gotoView, placeCursor, preparePage, Recorder, settlePage } from '../lib';
import { ART_DIR, LIBRARY_ITEMS, LIBRARY_PLAYLISTS, LIBRARY_ROOTS, libraryInit } from '../fixtures/media-library';
import { roadmapFixtures } from '../fixtures/roadmap';

const PROBE = process.env['CAP_PROBE'];

async function open(page: Page): Promise<void> {
  await page.route('**/__cap/media/**', (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop() ?? '');
    const file = path.join(ART_DIR, name);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(file) });
  });
  await installMockBridge(page, roadmapFixtures(), { cspGuard: false });
  await page.addInitScript(libraryInit, { items: LIBRARY_ITEMS, roots: LIBRARY_ROOTS, playlists: LIBRARY_PLAYLISTS });
  await preparePage(page, { theme: 'dark', ui: { mediaTab: 'library' } });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await gotoView(page, 'Media');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 800 });
  }).toPass({ timeout: 8000 });
  if (PROBE) await page.screenshot({ path: `${PROBE}/media-pre.png` });
  const salt = page.getByRole('button', { name: /Salt Line/ }).first();
  if (!(await salt.isVisible().catch(() => false))) {
    await page.getByRole('tab', { name: /Library/ }).first().click({ timeout: 5000 }).catch(() => {});
  }
  await expect(salt).toBeVisible({ timeout: 15_000 });
  // Every poster decoded before the first frame.
  await expect
    .poll(() => page.evaluate(() => [...document.images].filter((i) => i.src.includes('/__cap/media/')).every((i) => i.complete && i.naturalWidth > 0)), { timeout: 10_000 })
    .toBe(true);
  // Start on a title already open, so the detail pane is never the empty state on camera.
  await card(page, /The Long Meridian/).click();
  await placeCursor(page, 900, 520);
  await settlePage(page, 900);
}

/** The grid's card (the last match — Continue watching renders the same cards above it). */
const card = (page: Page, name: RegExp) => page.getByRole('listitem').getByRole('button', { name }).last();
const kind = (page: Page, name: string) => page.getByRole('button', { name: new RegExp(`^${name}\\s*\\d+$`) }).first();

test('media-dark', async ({ page }) => {
  await open(page);
  if (PROBE) {
    await page.screenshot({ path: `${PROBE}/media-0.png` });
  }
  const rec = PROBE ? null : new Recorder(page, 'media-dark');
  await rec?.start();
  await page.waitForTimeout(650);

  // Films: drift over the grid, open Salt Line.
  await glideTo(page, card(page, /The Long Meridian/), 648, { x: 0.5, y: 0.4 });
  await page.waitForTimeout(180);
  await glideTo(page, card(page, /Salt Line/).last(), 432, { x: 0.5, y: 0.45 });
  await click(page);
  await page.waitForTimeout(1080);
  if (PROBE) await page.screenshot({ path: `${PROBE}/media-1.png` });

  // Shows ▸ Harbour Lights ▸ an episode.
  await glideTo(page, kind(page, 'Shows'), 576);
  await click(page);
  await page.waitForTimeout(432);
  await glideTo(page, card(page, /Harbour Lights/), 504, { x: 0.5, y: 0.45 });
  await page.waitForTimeout(252);
  await click(page);
  await page.waitForTimeout(360);
  await glideTo(page, page.getByRole('button', { name: /Shipping Forecast/ }).first(), 468, { x: 0.3, y: 0.5 });
  await click(page);
  await page.waitForTimeout(936);
  if (PROBE) await page.screenshot({ path: `${PROBE}/media-2.png` });

  // Music ▸ Neon Tide ▸ a track.
  await glideTo(page, kind(page, 'Music'), 576);
  await click(page);
  await page.waitForTimeout(504);
  await glideTo(page, card(page, /Neon Tide/), 468, { x: 0.5, y: 0.45 });
  await page.waitForTimeout(252);
  await click(page);
  await page.waitForTimeout(324);
  await glideTo(page, page.getByRole('button', { name: /Midnight Ferry/ }).first(), 432, { x: 0.3, y: 0.5 });
  await click(page);
  await page.waitForTimeout(936);
  if (PROBE) await page.screenshot({ path: `${PROBE}/media-3.png` });

  // Photos ▸ the Grand Canyon.
  await glideTo(page, kind(page, 'Photos'), 576);
  await click(page);
  await page.waitForTimeout(576);
  await glideTo(page, card(page, /Grand Canyon/), 504, { x: 0.5, y: 0.5 });
  await click(page);
  await page.waitForTimeout(360);
  await glide(page, 760, 640, 864);
  await page.waitForTimeout(648);
  if (PROBE) await page.screenshot({ path: `${PROBE}/media-4.png` });
  await rec?.stop();
});
