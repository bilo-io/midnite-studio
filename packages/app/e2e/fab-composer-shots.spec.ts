import { test, expect, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The FAB composer, one shot per tab.
 *
 * Not assertions — `fab-loops.spec.ts` carries those — just the PNGs the PR
 * embeds, from the same mocked bridge the suite uses so the picture is
 * reproducible. `SHOT_DIR` exists so the same spec can be run against an older
 * checkout to produce the "before" half of a comparison.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = process.env['SHOT_DIR'] ?? '../../docs/screenshots/adhoc-fab-controls';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

const TABS = [
  ['Ideate', 'innovate'],
  ['Create', 'automate'],
  ['Patrol', 'watchdog'],
  ['Medic', 'medic'],
] as const;

async function shootEveryTab(page: Page, suffix: string): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.getByRole('button', { name: 'Open quick access panel' }).click();
  await expect(page.getByRole('button', { name: 'Ideate', exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  for (const [tab, id] of TABS) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await page.waitForTimeout(250);
    await page.getByTestId(`loop-composer-${id}`).screenshot({ path: `${OUT}/${id}${suffix}.png` });
  }
}

test('the composer, one shot per tab', async ({ page }) => {
  await shootEveryTab(page, '');
});

/*
  And again in the dark. The composer's ground is a translucent wash of the
  tab's own sub-spectrum over `--popover`, so it is a genuinely different
  picture in each theme rather than the same one re-tinted — a light-only shot
  would say nothing about the theme most of this app is looked at in.
*/
test.describe('dark', () => {
  test.use({ colorScheme: 'dark' });

  test('the composer in the dark, one shot per tab', async ({ page }) => {
    await shootEveryTab(page, '-dark');
  });
});
