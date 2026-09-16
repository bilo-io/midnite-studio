import { expect, test, type Page } from '@playwright/test';

import {
  fixtures,
  installMockBridge,
  type MockFixtures,
  setTheme,
  shotPath,
} from './shots-helper';

const OUT = '../../docs/screenshots/adhoc-fab-menu';
const VARIANT = process.env['MSTUDIO_SHOT_VARIANT'] ?? 'after';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

for (const mode of ['dark', 'light'] as const) {
  test(`quick-access menu and FAB clearance (${mode})`, async ({ page }) => {
    await setTheme(page, mode);
    await open(page);

    const fab = page.getByRole('button', { name: 'Open quick access panel' });
    await fab.click();

    const menu = page.getByTestId('quick-access-menu');
    await expect(menu).toBeVisible();

    const viewport = page.viewportSize()!;
    await page.screenshot({
      path: shotPath(OUT, `fab-menu-${mode}-${VARIANT}.png`),
      clip: {
        x: viewport.width - 320,
        y: viewport.height - 420,
        width: 320,
        height: 420,
      },
    });
  });
}
