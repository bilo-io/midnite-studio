import { expect, test } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { seedEnabledApps, seedUiState } from './shots-helper';

/**
 * Browser capability this spec needs: **real pointer coordinates**.
 *
 * The switcher's reveal is driven by the pointer entering and leaving a region
 * that is itself nested inside `AppFrame`'s own hover-expanding rail, so the
 * two hover surfaces overlap. jsdom can only be told `mouseenter` happened —
 * it has no pointer, so it cannot show that moving the mouse to a coordinate
 * *outside* the group collapses it back, nor that a real `hover()` landing on
 * the group inside the rail re-expands it rather than being swallowed by the
 * rail's own hover handling. Everything else about this feature — which icons
 * render for a given `lastOpenedAppId`, when labels appear, the store
 * transitions that set it — is covered by `apps-rail-row.test.tsx` in vitest,
 * which is why this suite is one test and not five.
 */
test('the apps switcher collapses to the latest app and reveals every app on hover', async ({
  page,
}) => {
  await seedEnabledApps(page, ['spotify', 'google-calendar', 'youtube']);
  await seedUiState(page, { navMode: 'expanded' });
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');

  const apps = page.getByRole('group', { name: 'Apps' });
  const spotify = page.getByTestId('apps-rail-spotify');
  // `enabledApps` hydrates from localStorage a tick after first mount; before
  // that tick a disabled app has no rail button at all, so waiting for it to
  // become visible keeps the click below off a not-yet-rendered element (the
  // same race `apps-rail-shots.spec.ts` documents).
  await expect(spotify).toBeVisible();

  // Open the flyout on Spotify and close it again: the switcher should now
  // remember Spotify without a flyout being open to explain it.
  await spotify.click();
  await spotify.click();
  // A real pointer move out of the region — this is the half jsdom cannot do.
  await page.mouse.move(900, 400);

  await expect(spotify).toBeVisible();
  await expect(page.getByTestId('apps-rail-google-calendar')).toHaveCount(0);
  await expect(page.getByTestId('apps-rail-youtube')).toHaveCount(0);
  await expect(apps.getByText('Spotify')).toBeVisible();

  await apps.hover();

  await expect(page.getByTestId('apps-rail-google-calendar')).toBeVisible();
  await expect(page.getByTestId('apps-rail-youtube')).toBeVisible();
  await expect(apps.getByText('Google Calendar')).toBeVisible();
  await expect(apps.getByText('YouTube')).toBeVisible();
});
