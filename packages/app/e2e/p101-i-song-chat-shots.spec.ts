import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, type MockFixtures, setTheme, settle, SHOT_VIEWPORTS, shotPath } from './shots-helper';

/**
 * Phase 101 Theme I screenshots: the song chat beside the Editor — the engine and model pickers, a turn
 * mid-run with "Pass n of N" and Stop directly left of Send, and a reply that summarises what changed.
 * Needs a real browser only for the pixels; the wiring is covered by vitest (`song-chat-panel.test.tsx`).
 *
 * Run with `MSTUDIO_SHOTS=1`; skipped otherwise.
 */
const OUT = '../../docs/screenshots/p101-i';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 120_000 });
test.use({ viewport: SHOT_VIEWPORTS.wide });

const BAR = 1920;
const run = (startBar: number, pitches: number[]) =>
  pitches.map((pitch, i) => ({ pitch, startTick: (startBar - 1) * BAR + i * 480, durationTicks: 440, velocity: 92 }));
const lead = [...run(1, [72, 74, 76, 79]), ...run(2, [77, 76, 74, 72]), ...run(3, [74, 76, 77, 79]), ...run(4, [76, 74, 72, 67])];
const bass = [...run(1, [36, 36, 43, 43]), ...run(2, [41, 41, 36, 36]), ...run(3, [43, 43, 38, 38]), ...run(4, [36, 43, 36, 43])];
const song = {
  name: 'Night drive',
  tempos: [{ tick: 0, bpm: 96 }],
  tracks: [
    { id: 'lead', name: 'Lead', program: 80, color: '#6366f1', notes: lead },
    { id: 'bass', name: 'Bass', program: 33, color: '#10b981', notes: bass },
    { id: 'kit', name: 'Kit', channel: 9, color: '#f59e0b', notes: [] },
  ],
};
const edited = {
  ...song,
  tracks: [
    song.tracks[0],
    { ...song.tracks[1], notes: [...bass, ...run(5, [36, 43, 36, 43]), ...run(6, [38, 45, 38, 45]), ...run(7, [41, 48, 41, 48]), ...run(8, [43, 38, 43, 36])] },
    song.tracks[2],
  ],
};

const DATA: MockFixtures = {
  ...fixtures,
  media: { files: { 'audio:album': { 'Night drive.mid': 'mid', 'Night drive.song.json': JSON.stringify(song) } } },
};

async function openEditor(page: Page): Promise<void> {
  await page.route((u) => !/^(http:\/\/localhost|data:|blob:)/.test(u.href), (r) => r.abort());
  await installMockBridge(page, DATA);
  await page.goto('/');
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await page.getByRole('tab', { name: 'Audio' }).click();
    await expect(page.getByRole('tablist', { name: 'Audio mode' })).toBeVisible({ timeout: 2500 });
  }).toPass({ timeout: 45_000 });
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.getByRole('tab', { name: 'Editor' }).click();
  await expect(page.getByTestId('song-chat')).toBeVisible({ timeout: 30_000 });
}

const ask = async (page: Page, text: string) => {
  await page.getByLabel("Message the song's agent").fill(text);
  await page.getByTestId('song-chat-composer-send').click();
};

test('the song chat with its pickers', async ({ page }) => {
  await openEditor(page);
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'song-chat-pickers.png') });
});

test('a turn in flight: Pass n of N, latest action, Stop beside Send', async ({ page }) => {
  await openEditor(page);
  await page.evaluate(() => {
    const g = globalThis as unknown as { __mockMusicRun: (req: { runId: string }) => Promise<unknown>; __runId: string };
    g.__mockMusicRun = (req) => {
      g.__runId = req.runId;
      return new Promise(() => undefined);
    };
  });
  await ask(page, 'add a walking bass line under bars 5 to 8');
  await expect(page.getByTestId('song-chat-progress')).toBeVisible();
  await page.evaluate(() => {
    const g = globalThis as unknown as { __mockMusicEmit: { progress: (e: unknown) => void }; __runId: string };
    g.__mockMusicEmit.progress({ runId: g.__runId, mode: 'iterative', state: 'running', pass: { n: 2, max: 8 }, action: 'Added 16 notes to Bass' });
  });
  await expect(page.getByTestId('song-chat-progress')).toContainText('Pass 3 of 8');
  await settle(page, 400);
  await page.screenshot({ path: shotPath(OUT, 'song-chat-pass-progress.png') });
});

test('a reply that summarises what changed', async ({ page }) => {
  await openEditor(page);
  await page.evaluate((next) => {
    const g = globalThis as unknown as { __mockMusicRun: (req: unknown) => Promise<unknown>; __mockMusicEmit: { changed: (e: unknown) => void } };
    g.__mockMusicRun = async (req) => {
      const { repoId, project, name } = req as { repoId: string; project: string; name: string };
      g.__mockMusicEmit.changed({ repoId, project, name, song: next, summary: 'x', saved: true });
      return { ok: true, value: { mode: 'iterative', edits: 4, passes: 3, saved: true, summary: 'Added a walking bass that follows the lead, rising into the last two bars.' } };
    };
  }, edited);
  await ask(page, 'add a walking bass line under bars 5 to 8');
  await expect(page.getByTestId('song-chat-show')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('song-chat-show').click();
  await expect(page.getByTestId('piano-roll')).toHaveAttribute('data-selected-count', '16');
  await settle(page, 500);
  await page.screenshot({ path: shotPath(OUT, 'song-chat-change-summary.png') });
});
