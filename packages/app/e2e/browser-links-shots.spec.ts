import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, SHOT_VIEWPORTS } from './shots-helper';

/**
 * The committed screenshots for Phase 71 Themes A and C — the Settings ▸
 * Browser page's new "Link handling" section, light and dark.
 *
 * Only the settings surface is shot. Theme C's other two visuals are both
 * conditional on state a mocked bridge cannot honestly produce: the dev-server
 * tile appears only when a probe finds something listening on loopback, and
 * the emulation-limit line only while a viewport preset is active. A shot of
 * either would be a picture of a stub.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/p71-ac';

async function openBrowserSettings(page: Page): Promise<void> {
  await installShotsBridge(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  // The bottom-of-rail Settings entry is a plain button, not a router link.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page
    .getByRole('navigation', { name: 'Settings pages' })
    .getByRole('button', { name: 'Browser' })
    .click();
  await expect(page.getByText('Link handling')).toBeVisible();
}

/** Same two-step dark sequence every `*-shots.spec.ts` dark case uses. */
async function goDark(page: Page): Promise<void> {
  await page.emulateMedia({ colorScheme: 'dark' });
}
async function paintDark(page: Page): Promise<void> {
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await page.waitForTimeout(400);
}

const SETTLE_MS = 300;

test.describe('Settings ▸ Browser link handling screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.default });

  test('Link handling, light', async ({ page }) => {
    await openBrowserSettings(page);
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/link-handling-light.png` });
  });

  test('Link handling, dark', async ({ page }) => {
    await goDark(page);
    await openBrowserSettings(page);
    await paintDark(page);
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/link-handling-dark.png` });
  });
});
