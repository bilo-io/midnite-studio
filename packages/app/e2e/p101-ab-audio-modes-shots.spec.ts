import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 101 Themes A + B screenshots: Media ▸ Audio's Editor | Generator tabs over one project that
 * holds a generated variant and a song side by side. Real browser capability needed for the shot
 * itself (pixels); the tab logic and the song store are covered by vitest.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/p101-ab';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const DATA: MockFixtures = {
  ...fixtures,
  media: {
    files: {
      'audio:album': {
        'night-drive.wav': 'wav',
        'Demo.mid': 'mid',
        'Demo.song.json': JSON.stringify({ name: 'Demo', tracks: [] }),
      },
    },
  },
};

async function openAudio(page: Page): Promise<void> {
  await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(u.href), (r) => r.abort());
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Audio' }).click();
    await expect(page.getByRole('tablist', { name: 'Audio mode' })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, 'dark', { settleMs: 200 });
}

test('generator tab, the default', async ({ page }) => {
  await openAudio(page);
  await expect(page.getByRole('tab', { name: 'Generator', selected: true })).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'audio-generator.png') });
});

test('editor tab', async ({ page }) => {
  await openAudio(page);
  await page.getByRole('tab', { name: 'Editor' }).click();
  await expect(page.getByTestId('music-editor-empty')).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'audio-editor.png') });
});
