import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The title bar's left edge, for the PR.
 *
 * Not assertions — `components/title-bar-nav.test.tsx` carries those. Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast, the same
 * convention `landing-shots.spec.ts` follows.
 */
const OUT = '../../docs/screenshots/adhoc-compact-breadcrumbs';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

/** The strip itself, at 2x — a 40px-tall band is unreadable at 1x in a PR. */
const STRIP = { x: 0, y: 0, width: 760, height: 40 };

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

test('page label revealed, just after arrival', async ({ page }) => {
  await open(page);
  await page.screenshot({ path: `${OUT}/1-revealed.png`, clip: STRIP });
});

test('page label folded away, three seconds later', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(3600);
  await page.screenshot({ path: `${OUT}/2-folded.png`, clip: STRIP });
});

test('page label back on hover', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(3600);
  await page.locator('nav[aria-label="Location"] .breadcrumb-crumb').last().hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/3-hover.png`, clip: STRIP });
});
