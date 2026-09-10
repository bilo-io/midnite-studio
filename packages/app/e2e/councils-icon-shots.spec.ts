import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { setTheme, settle, shotPath } from './shots-helper';

/**
 * The rail's Councils row wearing Lucide's `circle-pile` in place of `LuUsers`.
 *
 * Not an assertion — `councils.spec.ts` covers behaviour. Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise, the same convention
 * `landing-shots.spec.ts` follows for one-off ad hoc verification shots.
 */
const OUT = '../../docs/screenshots/adhoc-councils-icon';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function openRail(page: import('@playwright/test').Page, dark = false): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  if (dark) await setTheme(page, 'dark');
  const link = page.getByRole('link', { name: 'Councils', exact: true });
  await link.hover();
  await expect(link.getByText('Councils', { exact: true })).toBeVisible();
  await settle(page, 200);
}

test('rail — Councils row, light', async ({ page }) => {
  await openRail(page);
  const link = page.getByRole('link', { name: 'Councils', exact: true });
  await link.screenshot({ path: shotPath(OUT, 'councils-row-light.png') });
});

test('rail — Councils row, dark', async ({ page }) => {
  await openRail(page, true);
  const link = page.getByRole('link', { name: 'Councils', exact: true });
  await link.screenshot({ path: shotPath(OUT, 'councils-row-dark.png') });
});
