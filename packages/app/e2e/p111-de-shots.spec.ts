import { expect, test, type Page } from '@playwright/test';

import { fixtures, installMockBridge, setTheme } from './shots-helper';

/**
 * Phase 111 Themes D screenshots: the title bar's primary-agent trigger with a
 * model pill, and its open picker with the model list. Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise. Needs real CSS to look right, hence a
 * browser rather than jsdom.
 */
test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const OUT = '../../docs/screenshots/p111-de';

async function seedModel(page: Page, model: string | null): Promise<void> {
  await page.addInitScript((m) => {
    try {
      const stored = localStorage.getItem('midnite-studio.ui');
      const persisted = stored ? JSON.parse(stored) : { version: 33 };
      persisted.state = { ...persisted.state, primaryAgent: 'claude', primaryModelByAgent: m ? { claude: m } : {} };
      localStorage.setItem('midnite-studio.ui', JSON.stringify(persisted));
    } catch {
      /* Unparseable profile — the app discards it too. */
    }
  }, model);
}

for (const theme of ['light', 'dark'] as const) {
  test(`title bar model pill and picker (${theme})`, async ({ page }) => {
    await seedModel(page, 'opus-5');
    await installMockBridge(page, fixtures);
    await page.goto('/');
    await expect(page.getByTestId('status-bar')).toBeVisible();
    await setTheme(page, theme, { settleMs: 200 });
    await page.mouse.move(900, 500);
    await expect(page.getByTestId('titlebar-primary-model')).toBeVisible();
    await page.locator('.titlebar-root').screenshot({ path: `${OUT}/titlebar-pill-${theme}.png` });

    await page.getByTestId('titlebar-primary-agent').click();
    await expect(page.getByTestId('primary-model-section')).toBeVisible();
    await page.screenshot({ path: `${OUT}/picker-${theme}.png`, clip: { x: 0, y: 0, width: 1280, height: 640 } });
  });
}
