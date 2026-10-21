import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { clickRailLink, installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Playwright/real-browser: Media ▸ Models' explorer drag and drop. Needs a real browser because the
 * move is driven by native HTML5 drag events (dragstart / dragover / drop with a live DataTransfer and
 * real hit-testing of the drop target) — jsdom only fires the events we hand it, so what vitest
 * (`model-explorer.bridge.test.tsx`) proves is the drop *rules*; this proves a real pointer gesture reaches
 * them. Everything else about the explorer (menus, confirms, tree building, the centre switch) is vitest.
 */
test.use({ viewport: { width: 1400, height: 900 }, contextOptions: { reducedMotion: 'reduce' } });

const DATA: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'model:animals': { 'fox/fox.obj': 'o x', 'fox/fox.json': '{}' },
      'model:toys': {},
    },
  },
};

async function openModels(page: Page): Promise<void> {
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Models' }).click();
    await expect(page.getByRole('tab', { name: 'Models', selected: true })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test('dragging a model folder onto another group moves it there', async ({ page }) => {
  await openModels(page);
  const row = page.locator('[data-testid="model-row"][data-path="animals/fox"]');
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.dragTo(page.locator('[data-testid="model-group"][data-path="toys"]'));
  await expect(page.locator('[data-testid="model-row"][data-path="toys/fox"]')).toBeVisible();
  await expect(page.locator('[data-testid="model-row"][data-path="animals/fox"]')).toHaveCount(0);
});
