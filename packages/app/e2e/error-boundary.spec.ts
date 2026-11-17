// e2e-capability: focus order (keyboard activation through the real rail across lazy views)
import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Error boundary around the view slot (Phase 60 Theme B).
 *
 * Browser capability needed: a multi-view flow through the real rail with real
 * lazy chunks. jsdom cannot mount `App`'s rail + view slot + `Suspense`
 * together, which is why the RTL suite tests the boundary in isolation.
 *
 * The throw is forced through the dev-only `window.__mstudioTestThrow` hook
 * (present on the Vite dev server this suite runs on). The label is the rail
 * label, so `History`, never `history`. `Timeline` (the keep-alive `graph`
 * view) is deliberately never thrown in: its `resetKey` never changes, so only
 * Try again recovers it.
 */

async function open(page: import('@playwright/test').Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'History' })).toBeVisible();
}

/** Keyboard activation, not `.click()` — see history.spec.ts for why. */
async function goTo(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.getByRole('link', { name }).focus();
  await page.keyboard.press('Enter');
}

async function throwIn(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() =>
    (
      window as unknown as { __mstudioTestThrow?: (l: string, m?: string) => void }
    ).__mstudioTestThrow?.('History', 'forced by e2e'),
  );
}

test('a throwing view leaves the rail usable and remounts fresh on return', async ({ page }) => {
  await open(page);
  await goTo(page, 'History');
  await throwIn(page);

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('History stopped rendering');
  await expect(alert).toContainText('forced by e2e');

  await page.getByRole('button', { name: 'Copy details' }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __mstudioClipboard: string[] }).__mstudioClipboard.at(-1),
      ),
    )
    .toContain('forced by e2e');
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { __mstudioClipboard: string[] }).__mstudioClipboard.at(-1),
      ),
    )
    .toContain('\n\n');

  await goTo(page, 'Timeline');
  await expect(page.getByRole('alert')).toHaveCount(0);

  await goTo(page, 'History');
  await expect(
    page.getByRole('tablist', { name: 'History' }).getByRole('tab', { name: 'Journal' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Try again recovers in place', async ({ page }) => {
  await open(page);
  await goTo(page, 'History');
  await throwIn(page);
  await expect(page.getByRole('alert')).toContainText('History stopped rendering');

  await page.getByRole('button', { name: 'Try again' }).click();

  await expect(
    page.getByRole('tablist', { name: 'History' }).getByRole('tab', { name: 'Journal' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
