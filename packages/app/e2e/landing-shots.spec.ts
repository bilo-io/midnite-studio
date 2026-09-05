import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * The landing page's four slides, as PNGs for the PR.
 *
 * Not assertions — `landing.spec.ts` carries those. Run with
 * `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast, the
 * same convention `fab-loops-shots.spec.ts` follows.
 */
const OUT = '../../docs/screenshots/adhoc-landing-carousel';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function openLanding(page: Page, dark = false): Promise<void> {
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  if (dark) await page.evaluate(() => document.documentElement.classList.add('dark'));
  // Hover first, then click: the rail expands on hover, so the brand row is
  // still moving when a synthetic click reaches where it used to be. See
  // `landing.spec.ts`'s `goHome`.
  const home = page.getByRole('button', { name: 'Go to the landing page' }).first();
  await home.hover();
  await page.waitForTimeout(400);
  await home.click();
  await expect(page.getByTestId('landing-view')).toBeVisible();
  // Let the gradient's 4s rotation reach a lit frame before the shutter.
  await page.waitForTimeout(900);
}

const SLIDES = ['stage', 'shortcuts-1', 'shortcuts-2', 'fab'] as const;

for (const [index, name] of SLIDES.entries()) {
  test(`slide ${index + 1} — ${name}`, async ({ page }) => {
    await openLanding(page);
    if (index > 0) {
      await page.getByTestId(`landing-dot-${index}`).click();
      // Past the 170ms exit and the 420ms bounce-in.
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: `${OUT}/${index + 1}-${name}.png` });
  });
}

/** One dark shot too — the gradient was tuned on a dark FAB panel. */
test('slide 1, dark', async ({ page }) => {
  await openLanding(page, true);
  await page.screenshot({ path: `${OUT}/1-stage-dark.png` });
});

test('slide 4, dark', async ({ page }) => {
  await openLanding(page, true);
  await page.getByTestId('landing-dot-3').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/4-fab-dark.png` });
});
