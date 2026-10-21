import { expect, test } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/** Media ▸ Video right-panel tabs screenshots for the PR. Run with `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/adhoc-music-video';
const DATA: MockFixtures = {
  ...fixtures,
  video: {
    projects: [{ id: 'acme/marketing/001-launch', title: 'Launch film', valid: true, composition: 'AcmeLaunch' }],
    resolution: { root: '/work/acme-videos', source: 'repo', setupTarget: '/work/acme-videos/.midnite/media/video' },
    files: {
      'acme/marketing/001-launch:output': [
        { name: 'v1-rough.mp4', isDir: false, size: 4_200_000, mtimeMs: 1 },
        { name: 'v2-scored.mp4', isDir: false, size: 5_100_000, mtimeMs: 2 },
      ],
    },
    fileContent: { 'acme/marketing/001-launch:output/CHANGELOG.md': '## v2-scored\n\n- tightened the intro\n' },
  },
};

test.describe('video panel tabs screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.board });

  test('edit and versions', async ({ page }) => {
    await installMockBridge(page, DATA);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible({ timeout: 90_000 });
    await expect(async () => {
      await clickRailLink(page, 'Media');
      await page.getByRole('tab', { name: 'Video' }).click();
      await expect(page.getByRole('tab', { name: 'Video', selected: true })).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5000 });
    await page.getByRole('button', { name: /Launch film/ }).click();
    await page.getByRole('tab', { name: 'Edit with AI' }).click();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'edit.png') });
    await page.getByRole('tab', { name: 'Versions' }).click();
    await page.getByRole('button', { name: /v2-scored\.mp4/ }).last().click();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'versions.png') });
  });
});
