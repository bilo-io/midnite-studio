import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { seedEnabledApps, seedUiState, setTheme, settle, shotPath } from './shots-helper';

/**
 * Phase 83 — the third-party apps rail's own screenshot set: the rail row
 * with all three apps enabled (light/dark), the flyout open on one app, and
 * the detached-popout content for two apps.
 *
 * `navMode: 'expanded'` is seeded everywhere a rail icon is clicked, not just
 * screenshotted. `@bilo-io/shell`'s rail hover-previews the collapsed state
 * into a wider ROW-layout overlay (see `apps-rail-row.tsx`'s `expanded`
 * prop), drawn at the rail's own `z-40` — BELOW this flyout's `z-popover`
 * (85). With the flyout already open and the rail merely hover-expanded
 * (not locked), the flyout paints over the newly-widened rail region, and a
 * second rail icon that only exists in the expanded layout becomes
 * genuinely unclickable by mouse for as long as both are on screen at once.
 * Locking the rail open removes the hover transition entirely, which is
 * also what makes both icons stay put mid-interaction — the real trigger a
 * user hitting this would be reaching for their SECOND app before their
 * first click's hover-preview settles, not a fixture quirk.
 *
 * The "two apps detached at once, both visible" acceptance bullet is the
 * same shape Phase 55 Theme F.2/F.3 already drew a line around: this suite
 * mocks a single browser tab, so it cannot open two real `BrowserWindow`s at
 * once. What it CAN show — and does, mirroring
 * `detached-panels-shots.spec.ts`'s own `POPOUT_ROLES` loop — is each app's
 * `DetachedRoot` rendered standalone. Two real, simultaneous popouts stay a
 * human pass (see the phase doc's own "Not in this phase").
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise so the normal suite stays fast.
 */
const OUT = '../../docs/screenshots/phase-83-apps-rail';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

async function openWithAllAppsEnabled(page: import('@playwright/test').Page): Promise<void> {
  await seedEnabledApps(page, ['spotify', 'google-calendar', 'youtube']);
  await seedUiState(page, { navMode: 'expanded' });
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  // `enabledApps` is persisted state, hydrated from localStorage a tick after
  // first mount — waiting for the rail icon to actually leave its disabled
  // state is what keeps a click below from racing that hydration and landing
  // on a still-inert (`aria-disabled`) button.
  await expect(page.getByTestId('apps-rail-spotify')).not.toHaveAttribute('aria-disabled', 'true');
}

test('rail row — all three apps enabled, light', async ({ page }) => {
  await openWithAllAppsEnabled(page);
  await settle(page, 200);
  await page.getByRole('group', { name: 'Apps' }).screenshot({ path: shotPath(OUT, 'rail-row-light.png') });
});

test('rail row — all three apps enabled, dark', async ({ page }) => {
  await openWithAllAppsEnabled(page);
  await setTheme(page, 'dark');
  await settle(page, 200);
  await page.getByRole('group', { name: 'Apps' }).screenshot({ path: shotPath(OUT, 'rail-row-dark.png') });
});

test('rail row — apps not enabled render inert', async ({ page }) => {
  await seedUiState(page, { navMode: 'expanded' });
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  const spotify = page.getByTestId('apps-rail-spotify');
  await expect(spotify).toHaveAttribute('aria-disabled', 'true');
  await settle(page, 200);
  await page.getByRole('group', { name: 'Apps' }).screenshot({ path: shotPath(OUT, 'rail-row-disabled.png') });
});

test('flyout open on one app', async ({ page }) => {
  await openWithAllAppsEnabled(page);
  await page.getByTestId('apps-rail-spotify').click();
  const flyout = page.getByTestId('apps-flyout');
  await expect(flyout).toBeVisible();
  await expect(flyout).toHaveAttribute('aria-label', 'Spotify');
  await settle(page, 200);
  await flyout.screenshot({ path: shotPath(OUT, 'flyout-open-spotify.png') });
});

test('flyout switches its active app on a second rail click', async ({ page }) => {
  await openWithAllAppsEnabled(page);
  await page.getByTestId('apps-rail-spotify').click();
  await expect(page.getByTestId('apps-flyout')).toHaveAttribute('aria-label', 'Spotify');

  await page.getByTestId('apps-rail-youtube').click();
  const flyout = page.getByTestId('apps-flyout');
  await expect(flyout).toHaveAttribute('aria-label', 'YouTube');
  await settle(page, 200);
  await flyout.screenshot({ path: shotPath(OUT, 'flyout-switched-youtube.png') });
});

const DETACHED_APP_ROLES = ['apps-spotify', 'apps-google-calendar'] as const;

for (const role of DETACHED_APP_ROLES) {
  test(`DetachedRoot(${role}) — one app's own popout content`, async ({ page }) => {
    await installMockBridge(page, { ...fixtures, windowRole: role } as MockFixtures);
    await page.goto('/graph');
    await expect(page.locator('body')).toBeVisible();
    // The re-dock affordance `DetachedWindowFrame`'s non-merged-role fallback
    // draws for every panel role that isn't terminal/repos/browser/graph —
    // proof this popout is a real docked-panel-style window, not a page
    // duplicate (which would say "Close", never "Re-dock").
    const title = role === 'apps-spotify' ? 'Spotify' : 'Google Calendar';
    await expect(page.getByRole('button', { name: `Re-dock ${title}` })).toBeVisible();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT, `detached-${role}.png`) });
  });
}
