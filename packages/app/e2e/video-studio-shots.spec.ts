import { expect, test } from '@playwright/test';

import {
  clickRailLink,
  fixtures,
  installMockBridge,
  type MockFixtures,
  settle,
  SHOT_VIEWPORTS,
  shotPath,
} from './shots-helper';

/**
 * The Phase 44 Video Studio screenshots. Not assertions —
 * `video-studio.spec.ts` owns those. These exist to produce the PNGs the PR
 * embeds, matching `conflict-resolution-studio-shots.spec.ts`'s own posture:
 * this is a brand-new view, so there is no "before" — only the states this
 * phase adds.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/phase-44-video-studio';

const SETTLE_MS = 300;

const PROJECT = { id: 'showreel', title: 'COP31 showreel', valid: true, composition: 'Main' };

async function openVideo(page: import('@playwright/test').Page, data: MockFixtures): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(async () => {
    await clickRailLink(page, 'Video');
    await expect(page.getByRole('heading', { name: 'Video' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
}

test.describe('video studio screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.board });

  test('no projects yet', async ({ page }) => {
    await openVideo(page, fixtures);
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'no-projects.png') });
  });

  test('a project selected, studio stopped', async ({ page }) => {
    await openVideo(page, { ...fixtures, video: { projects: [PROJECT] } });
    await page.getByRole('button', { name: 'COP31 showreel' }).click();
    await page.getByText("The studio isn't running.").waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'project-stopped.png') });
  });

  test('the studio failed to start', async ({ page }) => {
    // `studioStatus` seeds `studio.start`'s own response, not an initial
    // fetch — see `video-studio.spec.ts`'s own note on why.
    await openVideo(page, {
      ...fixtures,
      video: {
        projects: [PROJECT],
        studioStatus: { [PROJECT.id]: { state: 'failed', stderr: ['Error: EADDRINUSE: address already in use'] } },
      },
    });
    await page.getByRole('button', { name: 'COP31 showreel' }).click();
    await page.getByRole('button', { name: 'Start studio' }).click();
    await page.getByText('The studio failed to start').waitFor();
    await settle(page, SETTLE_MS);
    await page.screenshot({ path: shotPath(OUT, 'studio-failed.png') });
  });
});
