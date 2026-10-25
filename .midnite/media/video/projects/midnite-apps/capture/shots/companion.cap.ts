/**
 * companion-dark — Studio ▸ Companion in docked side panel, typing, streaming audio,
 * and transitioning into full Zen mode with glowing orb, turn cards, and HUD dials.
 */
import { expect, test, type Page } from '@playwright/test';

import { installMockBridge } from '../../../../../../../packages/app/test-support/mock-bridge';
import { click, glide, glideTo, placeCursor, preparePage, Recorder, settlePage } from '../lib';
import { roadmapFixtures } from '../fixtures/roadmap';

test.use({
  launchOptions: {
    args: ['--force-color-profile=srgb', '--hide-scrollbars', '--enable-gpu'],
  },
});

async function openCompanion(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 37 };
      persisted.state = {
        ...persisted.state,
        companionEnabled: true,
      };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    } catch {
      // ignore
    }
  });

  await installMockBridge(page, roadmapFixtures({} as never), { cspGuard: false });
  await preparePage(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 30_000 });
  // The panel docks from the quick-access menu: Mod+l, then C.
  await page.keyboard.press('Meta+l');
  await page.keyboard.press('c');
  await expect(page.locator('[data-testid="companion-panel"]')).toBeVisible({ timeout: 20_000 });
  await placeCursor(page, 900, 500);
  await settlePage(page, 1500);
}

test('companion-dark', async ({ page }) => {
  await openCompanion(page);
  const rec = new Recorder(page, 'companion-dark');
  await rec.start();
  await page.waitForTimeout(600);

  // 1. In side panel: inspect the docked glowing orb and input bar
  const panel = page.locator('[data-testid="companion-panel"]');
  const orb = panel.locator('[data-testid="companion-orb"]');
  await glideTo(page, orb, 800);
  await page.waitForTimeout(600);

  // 2. Click the Zen mode toggle in the companion header to enter full Zen mode
  const zenToggle = page.locator('[data-testid="companion-zen-toggle"]');
  await glideTo(page, zenToggle, 700);
  await click(page);

  // 3. Full Zen mode stage is open
  await expect(page.locator('[data-testid="companion-zen-stage"]')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(800);

  // 4. Hover over HUD dial and orb in Zen stage
  const zenOrb = page.locator('[data-testid="companion-zen-orb"]');
  const box = (await zenOrb.boundingBox())!;
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, 800);
  await page.waitForTimeout(1000);

  // 5. Glance at corner HUD dials
  const dial = page.locator('[data-testid="companion-zen-dial-cpu"]').or(page.locator('[data-testid="companion-zen-top-right"]')).first();
  if (await dial.isVisible()) {
    await glideTo(page, dial, 600);
    await page.waitForTimeout(800);
  }

  await rec.stop();
});
