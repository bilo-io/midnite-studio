import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 101 Theme F screenshots: the mixer, a track's effects chain and an automation lane. Real
 * pixels only; behaviour is vitest (`editor-tab.test.tsx`, the model tests). Repos panel closed (the
 * shots helper's default). Run with `MSTUDIO_SHOTS=1`.
 */
const OUT = '../../docs/screenshots/p101-f';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 90_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const Q = 480;
const chord = (start: number, pitches: number[], len = Q * 4) => pitches.map((pitch) => ({ pitch, startTick: start, durationTicks: len, velocity: 88 }));
const progression = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
const song = {
  name: 'Demo',
  tempos: [{ tick: 0, bpm: 108 }],
  mixer: { master: { volume: 0.9 } },
  tracks: [
    {
      id: 'keys', name: 'Keys', program: 4, color: '#6366f1',
      mixer: { volume: 0.85, pan: -0.2 },
      effects: [
        { id: 'fx1', type: 'chorus', params: { depth: 0.6 } },
        { id: 'fx2', type: 'reverb', params: { decay: 3.2, wet: 0.35 } },
        { id: 'fx3', type: 'delay', bypass: true },
        { id: 'fx4', type: 'eq3', params: { low: 3, high: -2 } },
      ],
      automation: [
        { id: 'lane1', target: 'volume', curve: 'linear', points: [{ tick: 0, value: 0.3 }, { tick: Q * 4, value: 1 }, { tick: Q * 10, value: 0.85 }, { tick: Q * 16, value: 0.4 }] },
        { id: 'lane2', target: 'fx:fx2:wet', curve: 'step', points: [{ tick: 0, value: 0.1 }, { tick: Q * 8, value: 0.6 }, { tick: Q * 12, value: 0.25 }] },
        { id: 'lane3', target: 'pan', curve: 'linear', points: [{ tick: 0, value: -0.8 }, { tick: Q * 8, value: 0.8 }, { tick: Q * 16, value: -0.8 }] },
      ],
      notes: [0, 1, 2, 3].flatMap((bar) => chord(bar * Q * 4, progression[bar]!)),
    },
    {
      id: 'bass', name: 'Bass', program: 33, color: '#22c55e', mixer: { volume: 0.7 },
      effects: [{ id: 'fx1', type: 'compressor' }],
      notes: [0, 1, 2, 3].flatMap((bar) => [0, 2].map((beat) => ({ pitch: progression[bar]![0]! - 24, startTick: bar * Q * 4 + beat * Q, durationTicks: Q, velocity: 100 }))),
    },
    {
      id: 'lead', name: 'Lead', program: 73, color: '#f59e0b', mixer: { volume: 0.6, pan: 0.35, solo: false },
      effects: [{ id: 'fx1', type: 'filter', params: { frequency: 2400 } }],
      notes: [72, 74, 76, 79, 76, 74, 72, 67].map((pitch, i) => ({ pitch, startTick: i * Q * 2, durationTicks: Q * 2 - 60, velocity: 80 })),
    },
    {
      id: 'drums', name: 'Drums', channel: 9, color: '#ef4444', mixer: { volume: 0.75, mute: true },
      notes: Array.from({ length: 32 }, (_, i) => ({ pitch: i % 2 ? 42 : 36, startTick: i * (Q / 2), durationTicks: Q / 4, velocity: 80 })),
    },
  ],
};
const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'audio:album': { 'Demo.mid': 'mid', 'Demo.song.json': JSON.stringify(song) } }, gmCached: [4, 33, 73] },
} as MockFixtures;

async function openEditor(page: Page, lower: 'Mixer' | 'Automation'): Promise<void> {
  await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(u.href), (r) => r.abort());
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Audio' }).click();
    await page.getByRole('tab', { name: 'Editor' }).click({ timeout: 2500 });
    await expect(page.getByTestId('track-row').first()).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.getByRole('tab', { name: lower }).click();
  await page.mouse.move(900, 20);
  await settle(page, 500);
}

test('mixer strips and the active track effects chain', async ({ page }) => {
  await openEditor(page, 'Mixer');
  await expect(page.getByTestId('effect-card')).toHaveCount(4);
  await page.getByTestId('music-editor').screenshot({ path: shotPath(OUT, 'mixer-dark.png') });
});

test('effects chain close-up', async ({ page }) => {
  await openEditor(page, 'Mixer');
  await page.getByTestId('effects-chain').screenshot({ path: shotPath(OUT, 'effects-chain-dark.png') });
});

test('automation lanes', async ({ page }) => {
  await openEditor(page, 'Automation');
  await expect(page.getByTestId('automation-lane')).toHaveCount(3);
  await page.getByTestId('music-editor').screenshot({ path: shotPath(OUT, 'automation-dark.png') });
});
