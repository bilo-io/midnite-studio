import { test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';
import { settle, setTheme } from './shots-helper';

/** Phase 98 Theme J — screenshots of the Welcome finale. Run with MSTUDIO_SHOTS=1. */
test.skip(!process.env.MSTUDIO_SHOTS, 'screenshots only');
const OUT = '../../docs/screenshots/p98-j';

for (const [theme, motion] of [
  ['light', 'full'],
  ['dark', 'full'],
  ['light', 'reduced'],
] as const) {
  test(`finale ${theme} ${motion}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await installMockBridge(page, { ...fixtures, firstRun: true } as never);
    await page.goto('/');
    await setTheme(page, theme);
    await page.evaluate((m) => (document.documentElement.dataset['motion'] = m), motion);
    const overlay = page.getByTestId('setup-overlay');
    await overlay.getByRole('button', { name: 'Begin setup' }).click();
    for (let i = 0; i < 12 && (await overlay.getAttribute('data-step')) !== 'finale'; i += 1) {
      await page.keyboard.press('ArrowRight');
      await settle(page, 700);
    }
    await settle(page, 1500);
    await page.screenshot({ path: `${OUT}/finale-${theme}-${motion}.png` });
  });
}
