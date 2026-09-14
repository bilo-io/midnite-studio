import { expect, test, type Page } from '@playwright/test';
import { installShotsBridge, SHOT_VIEWPORTS } from './shots-helper';

const OUT = '../../docs/screenshots/doctor-toolchain';

async function openHealthSettings(page: Page): Promise<void> {
  await installShotsBridge(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'System Health' })
    .click();
  await expect(page.getByText('Toolchain', { exact: true })).toBeVisible();
}

async function goDark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
}

async function paintDark(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
}

const SETTLE_MS = 300;

test.describe('Settings ▸ System Health toolchain screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.default });

  test('System Health with toolchain, light', async ({ page }) => {
    await openHealthSettings(page);
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/settings-health-light.png` });
  });

  test('System Health with toolchain, dark', async ({ page }) => {
    await goDark(page);
    await openHealthSettings(page);
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/settings-health-dark.png` });
  });
});
