import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 101 Theme C screenshot: the Editor tab transport bar. Real pixels only; engine logic is vitest.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/p101-c';

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

test('editor tab', async ({ page }) => {
  await openAudio(page);
  await page.getByRole('tab', { name: 'Editor' }).click();
  await expect(page.getByTestId('music-transport')).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'editor-transport.png') });
});

