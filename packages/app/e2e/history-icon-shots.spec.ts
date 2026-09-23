import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { setTheme, settle, shotPath } from './shots-helper';

/**
 * The rail's History row wearing Lucide's `history` clock (`LuHistory`) in place of `LuScrollText`.
 *
 * Not an assertion — the History view's own specs cover behaviour. Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise, the same convention
 * `landing-shots.spec.ts` follows for one-off ad hoc verification shots.
 */
const OUT = '../../docs/screenshots/adhoc-history-icon-clock';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function openRail(page: import('@playwright/test').Page, dark = false): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  if (dark) await setTheme(page, 'dark');
  const link = page.getByRole('link', { name: 'History', exact: true });
  await link.hover();
  await expect(link.getByText('History', { exact: true })).toBeVisible();
  await settle(page, 200);
}

test('rail — History row, light', async ({ page }) => {
  await openRail(page);
  const link = page.getByRole('link', { name: 'History', exact: true });
  await link.screenshot({ path: shotPath(OUT, 'history-row-light.png') });
});

test('rail — History row, dark', async ({ page }) => {
  await openRail(page, true);
  const link = page.getByRole('link', { name: 'History', exact: true });
  await link.screenshot({ path: shotPath(OUT, 'history-row-dark.png') });
});

test('rail — whole rail with History hovered, dark', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1400 });
  await openRail(page, true);
  const rail = page.getByRole('link', { name: 'History', exact: true }).locator('xpath=ancestor::nav[1]');
  await rail.screenshot({ path: shotPath(OUT, 'rail-dark.png') });
});
