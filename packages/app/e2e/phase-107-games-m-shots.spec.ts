import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath, type MockFixtures } from './shots-helper';

/**
 * Phase 107 Theme M — PR screenshots of create and iterate (not assertions:
 * `game-iterate-panel.test.tsx` owns those). Run with `MSTUDIO_SHOTS=1`.
 * The agent run is the mock bridge's: progress is pushed through
 * `__mstudioMockGames.agentProgress`, so no agent or model is ever called.
 */
const OUT = '../../docs/screenshots/phase-107-games-m';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });
test.use({ viewport: SHOT_VIEWPORTS.board });

const GAME_ID = 'g0a1b2c3d4e5f';
const GAMES: MockFixtures = {
  ...fixtures,
  games: {
    resolvedRoot: '/Users/you/Midnite Games',
    list: [
      { gameId: GAME_ID, name: 'Moon Rover', path: '/Users/you/Midnite Games/moon-rover', engine: 'phaser', dimension: '2d', starter: 'top-down' },
      { gameId: 'g1f2e3d4c5b6a', name: 'Sky Fort', path: '/Users/you/Midnite Games/sky-fort', engine: 'three', dimension: '3d' },
    ],
  },
};

type MockGames = { agentProgress: (event: unknown) => void; calls: Array<Record<string, unknown>> };

async function openGame(page: Page, theme: 'dark' | 'light'): Promise<void> {
  await installMockBridge(page, GAMES);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await expect(page.getByRole('tablist', { name: 'Media' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await setTheme(page, theme, { settleMs: 200 });
  await page.getByRole('tab', { name: 'Games' }).click();
  await page.getByRole('button', { name: /Moon Rover/ }).click();
  await expect(page.getByTestId('game-iterate-panel')).toBeVisible();
}

async function startRun(page: Page): Promise<string> {
  await page.getByRole('slider', { name: 'Refinement passes' }).fill('3');
  await page.getByRole('textbox', { name: 'Prompt' }).fill('Add a double jump, and make the crystals spin');
  await page.getByRole('button', { name: 'Run agent' }).click();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  return page.evaluate(() => {
    const mock = (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames;
    return String(mock.calls.find((c) => c['call'] === 'agentRun')?.['runId']);
  });
}

const push = (page: Page, event: Record<string, unknown>) =>
  page.evaluate((e) => (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames.agentProgress(e), event);

for (const theme of ['dark', 'light'] as const) {
  test(`agent pass history with Undo turn (${theme})`, async ({ page }) => {
    await openGame(page, theme);
    const runId = await startRun(page);
    const base = { gameId: GAME_ID, runId, of: 3 };
    await push(page, { ...base, pass: 1, action: 'Pass 1 of 3' });
    await push(page, { ...base, pass: 1, action: 'Ran the game' });
    await push(page, { ...base, pass: 1, action: 'Played the game' });
    await push(page, { ...base, pass: 1, commit: { sha: '3f9c2a17be04d', files: ['src/player.js', 'src/genre/index.js'] } });
    await push(page, { ...base, pass: 2, action: 'Took a screenshot' });
    await push(page, { ...base, pass: 2, action: 'No files changed in this pass' });
    await push(page, { ...base, pass: 3, action: 'Read the game state' });
    await push(page, { ...base, pass: 3, commit: { sha: 'a71e0c55d2f98', files: ['src/scenes/level.js'] } });
    await push(page, {
      ...base,
      pass: 3,
      finished: {
        outcome: 'done',
        message: '2 commits — The player double-jumps and the crystals spin; checked both in play.',
        commits: [
          { sha: '3f9c2a17be04d', files: ['src/player.js', 'src/genre/index.js'] },
          { sha: 'a71e0c55d2f98', files: ['src/scenes/level.js'] },
        ],
      },
    });
    await expect(page.getByRole('button', { name: 'Undo turn' })).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `games-iterate-history-${theme}.png`) });
  });
}

test('a run in progress (dark)', async ({ page }) => {
  await openGame(page, 'dark');
  const runId = await startRun(page);
  await push(page, { gameId: GAME_ID, runId, of: 3, pass: 1, action: 'Ran the game' });
  await push(page, { gameId: GAME_ID, runId, of: 3, pass: 1, commit: { sha: '3f9c2a17be04d', files: ['src/player.js'] } });
  await push(page, { gameId: GAME_ID, runId, of: 3, pass: 2, action: 'Took a screenshot' });
  await expect(page.getByText('Pass 2 of 3')).toBeVisible();
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'games-iterate-running-dark.png') });
});

test('Ollama engine shows the warning (dark)', async ({ page }) => {
  await openGame(page, 'dark');
  const select = page.getByRole('combobox', { name: 'Engine' });
  await expect(select.locator('option[value^="ollama:"]').first()).toBeAttached();
  const value = await select.locator('option[value^="ollama:"]').first().getAttribute('value');
  await select.selectOption(value!);
  await expect(page.getByTestId('games-ollama-banner')).toBeVisible();
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'games-iterate-ollama-dark.png') });
});

test('create with a first prompt (dark)', async ({ page }) => {
  await installMockBridge(page, { ...fixtures, games: { list: [], resolvedRoot: '/Users/you/Midnite Games' } });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Media', exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await expect(page.getByRole('tablist', { name: 'Media' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 10_000 });
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.getByRole('tab', { name: 'Games' }).click();
  await page.getByPlaceholder('Moon Rover').fill('Neon Drift');
  await page.getByRole('textbox', { name: 'First prompt' }).fill('A top-down racer through a neon city, with drifting');
  await page.getByRole('button', { name: 'Create and run' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Create and run' })).toBeVisible();
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'games-create-first-prompt-dark.png') });
});
