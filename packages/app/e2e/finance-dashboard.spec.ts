import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * The Finance board's two real-browser behaviours; everything else about it
 * (the cards, the portfolio rules, sorting, the summary, the modals) is vitest
 * in `src/features/finance-dashboard/`.
 *
 * Needs a real browser because both are layout and pointer facts jsdom cannot
 * produce: a card genuinely growing under a pointer drag on its resize handle
 * (real `getBoundingClientRect`, real `react-grid-layout` pointer handling),
 * and the Insights button's hover fill, which is a CSS `::before` whose opacity
 * is only ever computed by a real style engine.
 */
test('Finance cards resize from a corner, the size persists, and Insights fills on hover', async ({ page }) => {
  await installMockBridge(page, { ...fixtures, markets: {} });
  await page.goto('/');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await page.getByRole('tab', { name: /^Finance/ }).click();

  // --- resizing ---------------------------------------------------------------
  const tile = page.locator('.react-grid-item', { has: page.getByRole('region', { name: 'Assets' }) });
  await tile.waitFor();
  await tile.hover();
  const before = (await tile.boundingBox())!;

  const handle = tile.locator('.react-resizable-handle-se');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 110, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await tile.boundingBox())!.width).toBeGreaterThan(before.width + 100);
  const after = (await tile.boundingBox())!;
  expect(after.height).toBeGreaterThan(before.height + 60);

  // The new footprint is what the persisted board holds for that card.
  const saved = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('midnite-studio.dashboard') ?? '{}') as {
      state?: { boards?: Record<string, { layout: { i: string; w: number; h: number }[] }> };
    };
    return raw.state?.boards?.['dash:finance']?.layout.find((item) => item.i === 'fin-assets');
  });
  expect(saved).toMatchObject({ i: 'fin-assets' });
  expect(saved?.w).toBeGreaterThan(4);

  // --- the Insights button ------------------------------------------------------
  const insights = page.getByRole('button', { name: 'Insights' });
  await expect(insights).toBeVisible();
  const fillOpacity = () => insights.evaluate((el) => getComputedStyle(el, '::before').opacity);
  const glow = () => insights.evaluate((el) => getComputedStyle(el).boxShadow);

  await page.mouse.move(0, 0);
  await expect.poll(fillOpacity).toBe('0');
  const restingGlow = await glow();
  expect(restingGlow).not.toBe('none');

  await insights.hover();
  await expect.poll(fillOpacity).toBe('1');
  // The glow strengthens on hover — a different, larger shadow, not the resting one.
  expect(await glow()).not.toBe(restingGlow);
});
