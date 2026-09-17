import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';
import { seedEnabledApps, seedUiState, settle, shotPath } from './shots-helper';

/**
 * Capture set for the bottom-of-rail apps switcher's reveal behaviour — the
 * four states the change is about: expanded and collapsed, each at rest (one
 * app) and hovered (all three).
 *
 * `MSTUDIO_SHOT_PREFIX` exists so the same spec can also photograph the OLD
 * behaviour for a side-by-side: check `apps-rail-row.tsx` back out at the
 * parent commit (it simply ignores the `expanded` prop it does not declare —
 * Vite does not typecheck), then
 * `MSTUDIO_SHOTS=1 MSTUDIO_SHOT_PREFIX=before pnpm exec playwright test
 * e2e/apps-rail-reveal-shots.spec.ts`. Without it the files land as `after-*`.
 *
 * Run with `MSTUDIO_SHOTS=1 … --workers=1`; skipped otherwise so the normal
 * suite stays fast. The serial flag is not optional here: four Vite-backed
 * workers on one machine race the repo landing view's own load, and a capture
 * that starts before it renders photographs an empty rail.
 */
const OUT = '../../docs/screenshots/adhoc-app-switcher-reveal';
const PREFIX = process.env['MSTUDIO_SHOT_PREFIX'] ?? 'after';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');

/**
 * Opens the app with all three apps enabled and the rail in `navMode`, having
 * opened and closed Spotify's flyout — which is what leaves `lastOpenedAppId`
 * set, the precondition for the collapsed switcher having one app to keep.
 */
async function openWithSpotifyAsRecent(page: Page, navMode: 'expanded' | 'collapsed'): Promise<void> {
  await seedEnabledApps(page, ['spotify', 'google-calendar', 'youtube']);
  await seedUiState(page, { navMode });
  await installMockBridge(page, fixtures as MockFixtures);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  const spotify = page.getByTestId('apps-rail-spotify');
  // `enabledApps` hydrates from localStorage a tick after first mount.
  await expect(spotify).not.toHaveAttribute('aria-disabled', 'true');
  await spotify.click();
  await spotify.click();
}

for (const navMode of ['expanded', 'collapsed'] as const) {
  test(`${navMode} rail — at rest`, async ({ page }) => {
    await openWithSpotifyAsRecent(page, navMode);
    // A real pointer move off the switcher: at rest means unhovered.
    await page.mouse.move(900, 400);
    await settle(page, 300);
    await page
      .getByRole('group', { name: 'Apps' })
      .screenshot({ path: shotPath(OUT, `${PREFIX}-${navMode}-rest.png`) });
  });

  test(`${navMode} rail — hovered`, async ({ page }) => {
    await openWithSpotifyAsRecent(page, navMode);
    await page.getByRole('group', { name: 'Apps' }).hover();
    await settle(page, 300);
    await page
      .getByRole('group', { name: 'Apps' })
      .screenshot({ path: shotPath(OUT, `${PREFIX}-${navMode}-hover.png`) });
  });
}
