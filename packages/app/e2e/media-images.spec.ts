import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Media ▸ Images (Phase 99 Theme C) — the two claims that need a real browser.
 *
 * - **Masonry + lightbox**: CSS `columns` only flow into several columns under
 *   real layout (jsdom has no geometry), and the lightbox's full-window overlay
 *   is a real `position: fixed` box covering the viewport. Keyboard stepping,
 *   wrap-around and Escape are vitest (`image-tab.bridge.test.tsx`); this spec
 *   proves the layout and the overlay geometry.
 * - **The "+" tile glow**: a hover-driven `box-shadow`/`border-color` change is
 *   real CSS; jsdom never computes either. Reduced motion keeps the glow (it is
 *   colour, not movement) but drops its transition.
 */
const images: Record<string, string> = Object.fromEntries(
  Array.from({ length: 9 }, (_, i) => [`shot-${i + 1}.png`, 'png']),
);
const data: MockFixtures = { ...fixtures, media: { files: { 'image:launch': images } } };

async function openImages(page: Page): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  // A cold Vite transform of the whole renderer can take well past the 5s default on a busy machine.
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 30_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Images' }).click();
    await expect(page.getByRole('button', { name: 'Generate image' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test('masonry flows into columns led by the "+" tile, and the lightbox covers the window', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openImages(page);
  const gallery = page.getByTestId('media-masonry');
  await expect(gallery.getByRole('button', { name: /^Open shot-/ })).toHaveCount(9);

  const plus = await page.getByRole('button', { name: 'Generate image' }).boundingBox();
  const lefts = await gallery
    .locator('li')
    .evaluateAll((items) => items.map((li) => Math.round(li.getBoundingClientRect().left)));
  expect(new Set(lefts).size).toBeGreaterThan(1);
  expect(Math.round(plus!.x)).toBe(Math.min(...lefts));

  await gallery.getByRole('button', { name: /^Open shot-/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(Math.round(box!.width)).toBe(viewport.width);
  expect(Math.round(box!.height)).toBe(viewport.height);
  await expect(page.getByTestId('lightbox-position')).toHaveText('1/9');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('lightbox-position')).toHaveText('9/9');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('the "+" tile glows on hover, and keeps the glow without a transition under reduced motion', async ({ page }) => {
  await openImages(page);
  const plus = page.getByRole('button', { name: 'Generate image' });
  const shadow = () => plus.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(await shadow()).toBe('none');
  await plus.hover();
  await expect.poll(shadow).toContain('rgba(139, 92, 246');
  const labelStroke = await plus
    .locator('.media-plus-tile__label')
    .evaluate((el) => getComputedStyle(el).getPropertyValue('-webkit-text-stroke-width'));
  expect(labelStroke).not.toBe('0px');

  await page.evaluate(() => document.documentElement.setAttribute('data-motion', 'reduced'));
  // `none` here, or the shell-wide reduced-motion reset's 0.001ms — either way, no visible transition.
  expect(parseFloat(await plus.evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(0.01);
  expect(await shadow()).toContain('rgba(139, 92, 246');
});
