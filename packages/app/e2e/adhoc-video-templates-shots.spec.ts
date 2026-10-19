import { expect, test } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/** Media ▸ Video's Templates section screenshots for the PR. Run with `MSTUDIO_SHOTS=1`. */
const OUT = '../../docs/screenshots/adhoc-video-templates';
const NEON = 'templates/youtube-tutorials/neon-hud';
const DATA: MockFixtures = {
  ...fixtures,
  video: {
    projects: [
      { id: 'midnite/marketing/001-launch', title: 'Launch film', valid: true, composition: 'Launch', brief: 'input/BRIEF.md' },
      { id: 'templates/midnite/golive-promo', title: 'Go-live promo', valid: true, composition: 'TemplateMidniteGoLivePromo', brief: 'input/BRIEF.md' },
      { id: NEON, title: 'Neon HUD tutorial', valid: true, composition: 'TemplateYoutubeTutorialsNeonHud', brief: 'input/BRIEF.md' },
    ],
    resolution: { root: '/work/midnite-videos', source: 'repo', setupTarget: '/work/midnite-videos/.midnite/media/video' },
    fileContent: {
      [`${NEON}:input/BRIEF.md`]: '# Neon HUD tutorial\n\nA 40-second explainer: black stage, neon headline, HUD pills, synthwave bed.\n',
    },
  },
};

test.describe('video templates screenshots', () => {
  test.skip(!process.env.MSTUDIO_SHOTS, 'set MSTUDIO_SHOTS=1 to regenerate');
  test.use({ viewport: SHOT_VIEWPORTS.board });

  test('templates section, menu and detail', async ({ page }) => {
    test.setTimeout(180_000);
    await installMockBridge(page, DATA);
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Views' })).toBeVisible({ timeout: 90_000 });
    await expect(async () => {
      await clickRailLink(page, 'Media');
      await page.getByRole('tab', { name: 'Video' }).click();
      await expect(page.getByRole('tab', { name: 'Video', selected: true })).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5000 });
    await page.getByRole('button', { name: /Neon HUD tutorial/ }).click();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'templates.png') });
    await page.getByRole('button', { name: /Neon HUD tutorial/ }).click({ button: 'right' });
    await expect(page.getByText('New project from template')).toBeVisible();
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT, 'menu.png') });
    await page.getByText('New project from template').click();
    await page.getByPlaceholder('COP31 showreel').fill('Intro to worktrees');
    await settle(page, 200);
    await page.screenshot({ path: shotPath(OUT, 'prompt.png') });
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByRole('button', { name: /Intro to worktrees/ })).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, 'created.png') });
  });
});
