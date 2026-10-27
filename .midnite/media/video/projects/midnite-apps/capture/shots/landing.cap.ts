/**
 * landing-light — the landing page (the rail's brand mark), light theme: the
 * feature carousel autoplays while the cursor drifts over the cheat sheet.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { glide, gotoView, placeCursor, preparePage, Recorder, settlePage } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';
import { terminalSessions } from '../fixtures/agents';

const GB = 1024 ** 3;
function samples(): unknown[] {
  const now = Date.now();
  return Array.from({ length: 90 }, (_, i) => {
    const t = i / 89;
    return {
      at: now - (89 - i) * 2000,
      cpu: 22 + 14 * Math.sin(t * 9) + 6 * Math.sin(t * 31),
      memory: 61 + 4 * Math.sin(t * 5),
      gpu: 12 + 9 * Math.max(0, Math.sin(t * 7)),
      memoryBytes: { used: (0.61 + 0.04 * Math.sin(t * 5)) * 36 * GB, total: 36 * GB },
      cpuInfo: { cores: 14, load1: 3.2 },
    };
  });
}

async function openLanding(page: Page): Promise<void> {
  await installMockBridge(page, roadmapFixtures({
      terminalSessions: terminalSessions(),
      markets: { watchlist: ['BTC', 'ETH', 'NVDA', 'AAPL'] },
      metricsSamples: samples(),
    } as never), { cspGuard: false });
  await preparePage(page, { theme: 'light' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  // Hydrate the terminal sessions (they load when the panel first mounts) so the agent count is real.
  await page.keyboard.press('Control+`');
  await expect(page.locator('.xterm-screen').first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Control+`');
  await page.waitForTimeout(500);
  // The watchlist ticker reads the finance store, which the Finance board fills.
  await gotoView(page, 'Dashboard');
  await page.getByRole('tab', { name: /^Finance/ }).click();
  await page.waitForTimeout(1800);
  const home = page.getByRole('button', { name: 'Go to the landing page' }).first();
  await home.hover();
  await page.waitForTimeout(500);
  await home.click();
  await page.mouse.move(900, 500);
  await page.waitForTimeout(600);
  // The lock-screen ticker's empty state ("No watchlisted assets") reads as a
  // gap on camera; hide just that line (the Finance store never hydrates on the mock).
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('span')) {
      if (el.textContent === 'No watchlisted assets') (el.parentElement ?? el).style.visibility = 'hidden';
    }
  });
  await placeCursor(page, 900, 500);
  await settlePage(page, 1200);
}

test('landing-light', async ({ page }) => {
  await openLanding(page);
  const rec = new Recorder(page, 'landing-light');
  await rec.start();
  await page.waitForTimeout(800);
  await glide(page, 760, 420, 1800);
  await page.waitForTimeout(2500);
  await glide(page, 1000, 640, 1800);
  await page.waitForTimeout(3500);
  await rec.stop();
});
