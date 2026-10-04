import { expect, test, type Page } from '@playwright/test';

import { clickRailLink, fixtures, installMockBridge, setTheme, settle, SHOT_VIEWPORTS, shotPath, type MockFixtures } from './shots-helper';

/**
 * Phase 107 Themes A + B — PR screenshots (not assertions: `game-tab.bridge.test.tsx`
 * and `games-root-section.test.tsx` own those). Run with `MSTUDIO_SHOTS=1`.
 *
 * The native `WebContentsView` a running game lives in is Electron's, so it is
 * not in a browser screenshot: the stage shows as the empty dark region the
 * view floats over. What these capture is the tab around it — the explorer,
 * the toolbar, the console drawer, the create form and the Settings section.
 */
const OUT = '../../docs/screenshots/phase-107-games-ab';

test.skip(!process.env['MSTUDIO_SHOTS'], 'set MSTUDIO_SHOTS=1 to write screenshots');
test.describe.configure({ timeout: 60_000 });
test.use({ viewport: SHOT_VIEWPORTS.board });

const GAMES: MockFixtures = {
  ...fixtures,
  games: {
    resolvedRoot: '/Users/you/Midnite Games',
    list: [
      { gameId: 'g0a1b2c3d4e5f', name: 'Moon Rover', path: '/Users/you/Midnite Games/moon-rover', engine: 'phaser', dimension: '2d', dirty: true },
      { gameId: 'g1f2e3d4c5b6a', name: 'Sky Fort', path: '/Users/you/Midnite Games/sky-fort', engine: 'three', dimension: '3d' },
      { gameId: 'g9z9z9z9z9z9z', name: 'broken-game', path: '/Users/you/Midnite Games/broken-game', engine: null, dimension: null, starter: null, valid: false, issue: 'engine: Invalid option: expected one of "phaser"|"three"' },
    ],
  },
};

async function openGames(page: Page, data: MockFixtures, theme: 'dark' | 'light'): Promise<void> {
  await installMockBridge(page, data);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await expect(async () => {
    await clickRailLink(page, 'Media');
    await expect(page.getByRole('tablist', { name: 'Media' })).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await setTheme(page, theme, { settleMs: 200 });
  await page.getByRole('tab', { name: 'Games' }).click();
}

type MockGames = {
  runState: (event: unknown) => void;
  console: (event: unknown) => void;
};

for (const theme of ['dark', 'light'] as const) {
  test(`running game with its console (${theme})`, async ({ page }) => {
    await openGames(page, GAMES, theme);
    await page.getByRole('button', { name: /Moon Rover/ }).click();
    await page.getByRole('button', { name: 'Run' }).click();
    await page.evaluate(() => {
      const mock = (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames;
      mock.console({
        gameId: 'g0a1b2c3d4e5f',
        runId: 'r1',
        entries: [
          { seq: 1, at: 1, level: 'log', text: 'midnite-ready' },
          { seq: 2, at: 2, level: 'warn', text: 'texture "player" is 4096px; consider an atlas' },
          { seq: 3, at: 3, level: 'exception', text: "TypeError: Cannot read properties of undefined (reading 'x')", source: 'mstudio-game://g0a1b2c3d4e5f/src/main.js', line: 42 },
        ],
      });
    });
    await expect(page.getByRole('log').getByText('midnite-ready')).toBeVisible();
    await settle(page, 300);
    await page.screenshot({ path: shotPath(OUT, `games-running-${theme}.png`) });
  });
}

test('crashed game offers Restart (dark)', async ({ page }) => {
  await openGames(page, GAMES, 'dark');
  await page.getByRole('button', { name: /Sky Fort/ }).click();
  await page.evaluate(() => {
    (window as unknown as { __mstudioMockGames: MockGames }).__mstudioMockGames.runState({
      gameId: 'g1f2e3d4c5b6a',
      runId: 'r2',
      state: 'crashed',
      reason: 'oom',
    });
  });
  await expect(page.getByRole('alert')).toContainText('The game crashed (oom). See the console.');
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'games-crashed-dark.png') });
});

test('empty state and the create form (dark)', async ({ page }) => {
  await openGames(page, { ...fixtures, games: { list: [], resolvedRoot: '/Users/you/Midnite Games' } }, 'dark');
  await expect(page.getByText('No games yet. Create one from a starter.')).toBeVisible();
  await page.getByPlaceholder('Moon Rover').fill('Neon Drift');
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'games-empty-create-dark.png') });
});

test('Settings ▸ Media ▸ Games (dark)', async ({ page }) => {
  await installMockBridge(page, GAMES);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
  await setTheme(page, 'dark', { settleMs: 200 });
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('navigation', { name: 'Settings pages' }).getByRole('button', { name: 'Media' }).click();
  await page.getByRole('button', { name: /Games/ }).click();
  await expect(page.getByTestId('games-settings')).toBeVisible();
  await settle(page, 300);
  await page.screenshot({ path: shotPath(OUT, 'settings-games-dark.png') });
});
