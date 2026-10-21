import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 101 Themes J + K screenshots: the Editor's export toolbar (range, MP3 bitrate, Send to Generator,
 * Export split button with .mid / WAV / MP3) and the Generator variant that Send to Generator lands.
 * Real browser capability needed for the shot itself (pixels); the plumbing is covered by vitest.
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/p101-j';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 240_000 });
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
    await expect(page.getByRole('tablist', { name: 'Audio mode' })).toBeVisible({ timeout: 15_000 });
  }).toPass({ timeout: 100_000 });
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.getByRole('tab', { name: 'Editor' }).click();
  await expect(page.getByTestId('music-transport')).toBeVisible();
}

test('editor export toolbar', async ({ page }) => {
  await openAudio(page);
  await expect(page.getByRole('button', { name: 'Send to Generator' })).toBeEnabled();
  await page.getByRole('button', { name: 'Export format' }).click();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'export-toolbar.png') });
});

test('send to generator lands a linked variant', async ({ page }) => {
  await openAudio(page);
  // The mock bridge stands in for the offline render, which needs a real AudioContext.
  await page.evaluate(() => {
    const music = (window as unknown as { midniteStudio: { media: { music: Record<string, unknown> } } }).midniteStudio.media.music;
    void music;
  });
  await page.getByRole('button', { name: 'Send to Generator' }).click();
  await expect(page.getByRole('tab', { name: 'Generator', selected: true })).toBeVisible({ timeout: 30_000 });
  await settle(page, 600);
  await page.screenshot({ path: shotPath(OUT, 'send-to-generator.png') });
});
