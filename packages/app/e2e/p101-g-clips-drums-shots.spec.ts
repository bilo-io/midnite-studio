import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 101 Theme G screenshots: clips on the arrangement and the drum grid.
 * Real pixels only; behaviour is vitest and `piano-roll.spec.ts`. Repos panel closed (the shots
 * helper's default). Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/p101-g';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const Q = 480;
const chord = (start: number, pitches: number[], len = Q * 2, velocity = 90) =>
  pitches.map((pitch) => ({ pitch, startTick: start, durationTicks: len, velocity }));
const progression = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const song: Record<string, unknown> = {
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
      id: 'drums', name: 'Drums', channel: 9, color: '#ef4444', grid: { steps: 16, swing: 0.17 },
      notes: [
        ...[0, 4, 8, 12].map((s) => ({ pitch: 36, step: s, velocity: 118 })),
        ...[4, 12].map((s) => ({ pitch: 38, step: s, velocity: 104 })),
        ...Array.from({ length: 16 }, (_, s) => ({ pitch: 42, step: s, velocity: s % 4 === 0 ? 96 : 58 })),
        { pitch: 46, step: 14, velocity: 80 },
        { pitch: 39, step: 12, velocity: 70 },
      ].map((h) => {
        const len = (Q * 4) / 16;
        return { pitch: h.pitch, startTick: Math.round(h.step * len + (h.step % 2 ? 0.17 * len : 0)), durationTicks: len, velocity: h.velocity };
      }),
    },
  ],
};
song.clips = [
  { id: 'clip-1', trackId: 'keys', name: 'Chords', startTick: 0, lengthTicks: Q * 8, sourceStartTick: 0, sourceLengthTicks: Q * 8, loop: true },
  { id: 'clip-2', trackId: 'bass', name: 'Bass line', startTick: 0, lengthTicks: Q * 16, sourceStartTick: 0 },
  { id: 'clip-3', trackId: 'lead', name: 'Hook', startTick: Q * 8, lengthTicks: Q * 8, sourceStartTick: 0, sourceLengthTicks: Q * 8, loop: true },
] as never;
const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'audio:album': { 'Demo.mid': 'mid', 'Demo.song.json': JSON.stringify(song) } }, gmCached: [4, 33, 73] },
} as MockFixtures;

async function openEditor(page: Page, theme: 'light' | 'dark'): Promise<void> {
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

test('clips on the arrangement, dark', async ({ page }) => {
  await openEditor(page, 'dark');
  await page.getByTestId('arrangement-canvas').click({ position: { x: 150, y: 22 + 44 * 0 + 22 } });
  await settle(page, 300);
  await page.getByTestId('music-editor').screenshot({ path: shotPath(OUT, 'clips-dark.png') });
});

test('drum grid, light', async ({ page }) => {
  await openEditor(page, 'light');
  await page.getByTestId('track-row').nth(3).dispatchEvent('pointerdown');
  await expect(page.getByTestId('drum-grid')).toBeVisible();
  await page.getByTestId('step-36-4').click();
  await settle(page, 300);
  await page.getByTestId('music-editor').screenshot({ path: shotPath(OUT, 'drum-grid-light.png') });
});
