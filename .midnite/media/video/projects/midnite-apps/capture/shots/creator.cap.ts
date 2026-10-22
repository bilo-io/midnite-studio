/**
 * creator-dark — the Creator app's Media tabs, seeded from the real projects under
 * `.midnite/media/`: Docs ("Midnite Studio" in Docs Pilot, with its edit thread),
 * Images (the "generated" wallpapers, then the lightbox) and Audio ("night-drive":
 * The_Long_Ascent's waveform, playing). Bytes are the real files, served by
 * `fixtures/media-seed.ts`. Video is left out: it needs a Remotion project root.
 */
import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, placeCursor, preparePage, Recorder, settlePage, smoothWheel } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';
import { mediaFilesFrom, serveMediaFiles } from '../fixtures/media-seed';

const tab = (page: Page, name: string) => page.getByRole('tab', { name: new RegExp(`^${name}`) }).first();

async function openCreator(page: Page): Promise<void> {
  const files = {
    // The doc's lead screenshot has no file beside it in the Docs project; drop that one line.
    ...mediaFilesFrom('doc', 'Docs Pilot', { edit: (rel, text) => (rel.endsWith('.md') ? text.replace(/^!\[Midnite Studio — dark theme\]\([^)]*\)\n\n/m, '') : text) }),
    ...mediaFilesFrom('image', 'generated'),
    ...mediaFilesFrom('audio', 'night-drive'),
  };
  await installMockBridge(page, roadmapFixtures({ media: { files } } as never), { cspGuard: false });
  await serveMediaFiles(page);
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  await clickRailLink(page, 'Media');
  await page.mouse.move(900, 500);

  // Warm Audio and Images, then open on Docs.
  await tab(page, 'Audio').click();
  await page.getByText('Editor', { exact: true }).first().click();
  await expect(page.getByText('Piano Melody').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  await tab(page, 'Images').click();
  await expect(page.getByTestId('media-masonry')).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2500);
  await tab(page, 'Docs').click();
  await expect(page.getByRole('heading', { name: 'What it is' }).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1500);
  await placeCursor(page, 760, 560);
  await settlePage(page, 1200);
}

test('creator-dark', async ({ page }) => {
  await openCreator(page);
  const rec = new Recorder(page, 'creator-dark');
  await rec.start();
  await page.waitForTimeout(650);

  // Docs — 0.7 → ~3.9 s: read down the "Midnite Studio" doc.
  await glide(page, 700, 470, 700);
  await smoothWheel(page, { dy: 620 }, 1700);
  await glide(page, 620, 420, 600);

  // Images — ~3.9 → ~8 s: the gallery, then one wallpaper in the lightbox.
  await glideTo(page, tab(page, 'Images'), 450);
  await click(page);
  await page.waitForTimeout(350);
  const tiles = page.getByTestId('media-masonry').getByRole('button', { name: /^Open / });
  await glideTo(page, tiles.nth(2), 600);
  await page.waitForTimeout(150);
  await glideTo(page, tiles.nth(1), 500);
  await click(page);
  await page.waitForTimeout(1200);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);

  // Audio — ~8 → end: night-drive's "Song 1" in the editor — four tracks, then the drum grid.
  await glideTo(page, tab(page, 'Audio'), 450);
  await click(page);
  await page.waitForTimeout(300);
  const editor = page.getByText('Piano Melody').first();
  if (!(await editor.isVisible())) {
    await glideTo(page, page.getByText('Editor', { exact: true }).first(), 500);
    await click(page);
  }
  await expect(editor).toBeVisible();
  await glideTo(page, page.getByText('Bass', { exact: true }).first(), 600, { x: 6, y: 0.5 });
  await page.waitForTimeout(300);
  await glide(page, 900, 375, 900);
  await page.waitForTimeout(300);
  await glide(page, 680, 580, 800);
  await page.waitForTimeout(1500);
  await rec.stop();
});
