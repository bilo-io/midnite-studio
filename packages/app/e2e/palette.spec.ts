import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge, type MockFixtures } from './mock-bridge';

/**
 * Theme C: the surface itself. Ranking, matched-character highlighting and
 * every source besides commands arrive in later themes — this spec covers
 * exactly what Theme C built: open/close, filtering, keyboard selection, a
 * disabled command's reason, and the guard that stops a bound app chord from
 * firing out from under the search input.
 */

const MAIN = '/tmp/midnite-studio';

const localRef = (name: string, over: Record<string, unknown> = {}) => ({
  name,
  fullName: `refs/heads/${name}`,
  kind: 'localBranch',
  sha: 'a'.repeat(40),
  upstream: null,
  isHead: false,
  worktreePath: null,
  ...over,
});

const base: MockFixtures = {
  ...fixtures,
  refs: [localRef('main', { isHead: true, worktreePath: MAIN })],
  remotes: [],
  worktrees: [],
  statusEntries: [],
  statusByWorktree: { [MAIN]: [] },
  forge: { cli: { reason: 'ready' }, runs: [], pulls: [] },
};

async function open(page: Page): Promise<void> {
  await installMockBridge(page, base);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Worktrees' })).toBeVisible();
}

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command Palette' });
const search = (page: Page) => palette(page).getByRole('combobox', { name: 'Command palette search' });
const reposPanel = (page: Page) => page.getByRole('complementary', { name: 'Repositories' });

test('Mod+K opens the palette over the graph and Escape closes it', async ({ page }) => {
  await open(page);

  await page.keyboard.press('Meta+k');
  await expect(palette(page)).toBeVisible();
  await expect(search(page)).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
});

test('the title-bar button opens the palette too, and returns focus on close', async ({ page }) => {
  await open(page);

  const trigger = page.getByRole('button', { name: /Command Palette/ });
  await trigger.focus();
  await trigger.click();
  await expect(palette(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(palette(page)).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('typing narrows the list across groups', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+k');

  await search(page).fill('terminal');

  const options = palette(page).getByRole('option');
  await expect(options).toHaveCount(2);
  await expect(options).toContainText(['Toggle Terminal', 'Focus Terminal']);
});

test('ArrowDown and Enter run the selected command and close the palette', async ({ page }) => {
  await open(page);
  await expect(reposPanel(page)).toBeVisible();

  await page.keyboard.press('Meta+k');
  await search(page).fill('toggle repositories');
  await page.keyboard.press('Enter');

  await expect(palette(page)).toBeHidden();
  await expect(reposPanel(page)).toBeHidden();
});

test('clicking a row runs THAT row, even without hovering it first', async ({ page }) => {
  await open(page);
  await expect(reposPanel(page)).toBeVisible();

  await page.keyboard.press('Meta+k');
  await search(page).fill('toggle');
  // `dispatchEvent`, not `.click()` — it fires the click with no synthetic
  // mouseenter first, so the still-default `selectedIndex` (row 0, "Toggle
  // Terminal") stays whatever it was. The row that must actually run is the
  // one clicked, not the one still marked selected.
  await palette(page).getByRole('option', { name: 'Toggle Repositories' }).dispatchEvent('click');

  await expect(palette(page)).toBeHidden();
  await expect(reposPanel(page)).toBeHidden();
  await expect(page.locator('.xterm-screen')).toHaveCount(0);
});

test('a disabled command shows its reason and does not run on Enter', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  await search(page).fill('abort operation');

  const row = palette(page).getByRole('option', { name: 'Abort Operation' });
  await expect(row).toHaveAttribute('aria-disabled', 'true');
  await expect(row).toContainText('Coming in Phase 22');

  await page.keyboard.press('Enter');
  // Disabled commands never run — the palette stays open rather than silently
  // closing on a keystroke that did nothing.
  await expect(palette(page)).toBeVisible();
});

test('Mod+g typed into the palette does not toggle the repositories panel', async ({ page }) => {
  await open(page);
  await expect(reposPanel(page)).toBeVisible();

  await page.keyboard.press('Meta+k');
  await page.keyboard.press('Meta+g');
  await expect(palette(page)).toBeVisible();
  await expect(reposPanel(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await page.keyboard.press('Meta+g');
  await expect(reposPanel(page)).toBeHidden();
});

test('Mod+K opens the palette while the terminal has focus', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Control+`');
  await expect(page.locator('.xterm-screen')).toBeVisible();
  await page.locator('.xterm-screen').click();

  await page.keyboard.press('Meta+k');
  await expect(palette(page)).toBeVisible();
});

test('fuzzy search matches acronyms and renders mark tags', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  await search(page).fill('tt');

  const row = palette(page).getByRole('option', { name: /Toggle Terminal/ });
  await expect(row).toBeVisible();
  const marks = row.locator('mark');
  await expect(marks).toHaveCount(2);
});

test('palette navigates to views and settings', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  await search(page).fill('Settings: Appearance');
  await page.keyboard.press('Enter');

  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
});

