import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 101 Theme E screenshots: the arrangement, the piano roll and a track's instrument picker.
 * Real pixels only; behaviour is vitest and `piano-roll.spec.ts`. Repos panel closed (the shots
 * helper's default). Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/p101-e';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const Q = 480;
const chord = (start: number, pitches: number[], len = Q * 2, velocity = 90) =>
  pitches.map((pitch) => ({ pitch, startTick: start, durationTicks: len, velocity }));
const progression = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const song = {
  name: 'Demo',
  tempos: [{ tick: 0, bpm: 108 }],
  tracks: [
    {
      id: 'keys', name: 'Keys', program: 4, color: '#6366f1',
      notes: [0, 1, 2, 3].flatMap((bar) => chord(bar * Q * 4, progression[bar]!, Q * 4, 84 + bar * 4)),
    },
    {
      id: 'bass', name: 'Bass', program: 33, color: '#22c55e',
      notes: [0, 1, 2, 3].flatMap((bar) => [0, 2].map((beat) => ({ pitch: progression[bar]![0]! - 24, startTick: bar * Q * 4 + beat * Q, durationTicks: Q, velocity: 100 }))),
    },
    {
      id: 'lead', name: 'Lead', program: 73, color: '#f59e0b',
      notes: [72, 74, 76, 79, 76, 74, 72, 67].map((pitch, i) => ({ pitch, startTick: i * Q * 2, durationTicks: Q * 2 - 60, velocity: 70 + ((i * 13) % 50) })),
    },
    {
      id: 'drums', name: 'Drums', channel: 9, color: '#ef4444', mixer: { mute: true },
      notes: Array.from({ length: 32 }, (_, i) => ({ pitch: i % 2 ? 42 : 36, startTick: i * (Q / 2), durationTicks: Q / 4, velocity: 80 })),
    },
  ],
};
const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'audio:album': { 'Demo.mid': 'mid', 'Demo.song.json': JSON.stringify(song) } }, gmCached: [4, 33, 73] },
} as MockFixtures;

async function openEditor(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(u.href), (r) => r.abort());
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Audio' }).click();
    await page.getByRole('tab', { name: 'Editor' }).click({ timeout: 2500 });
    await expect(page.getByTestId('track-row').first()).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await page.mouse.move(900, 20);
  await settle(page, 500);
}

test('arrangement and piano roll, dark', async ({ page }) => {
  await openEditor(page, 'dark');
  await page.getByTestId('music-editor').screenshot({ path: shotPath(OUT, 'editor-dark.png') });
});

test('piano roll with a selection, light', async ({ page }) => {
  await openEditor(page, 'light');
  await page.getByTestId('piano-roll').focus();
  await page.getByTestId('piano-roll').press('ControlOrMeta+a');
  await settle(page, 300);
  await page.getByTestId('music-editor').screenshot({ path: shotPath(OUT, 'editor-selection-light.png') });
});

test('per-track instrument picker', async ({ page }) => {
  await openEditor(page, 'dark');
  await page.getByRole('button', { name: /Instrument for Bass/ }).click();
  await expect(page.getByTestId('gm-instrument-picker')).toBeVisible();
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'track-instrument-dark.png') });
});
