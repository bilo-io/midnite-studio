import { expect, test, type Page } from '@playwright/test';

import { installShotsBridge, SHOT_VIEWPORTS } from './shots-helper';

/**
 * The committed screenshots for Phase 63 — the new Settings ▸ Diff page,
 * light and dark. Both accordions expanded so all four preferences (and
 * their "Reset to defaults" buttons) are visible in one shot.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise, matching every other
 * `*-shots.spec.ts` in this suite.
 */
const OUT = '../../docs/screenshots/p63-abc';

async function openDiffSettings(page: Page): Promise<void> {
  await installShotsBridge(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  // The bottom-of-rail Settings entry is a plain button, not a router link.
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'Diff' }).click();
  await expect(page.getByText('Diff view')).toBeVisible();
  // "File lists" starts collapsed (Decision 3) — open it so both clusters show.
  await page.getByRole('button', { name: 'File lists' }).click();
  await expect(page.getByText('Uncommitted changes')).toBeVisible();
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

test.describe('Settings ▸ Diff screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.default });

  test('Diff settings, light', async ({ page }) => {
    await openDiffSettings(page);
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: `${OUT}/settings-diff-light.png` });
  });

  test('Diff settings, dark', async ({ page }) => {
    await goDark(page);
    await openDiffSettings(page);
    await paintDark(page);
    await page.screenshot({ path: `${OUT}/settings-diff-dark.png` });
  });
});
