import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge, type MockFixtures } from '../test-support/mock-bridge';

/**
 * Phase 82 Theme C, wave 4: 11 of this file's 14 tests moved to
 * `src/components/palette.bridge.test.tsx` — mounting `Palette` (through
 * `PaletteHost`) beside the same `useCommandHandlers`/`useKeybindings` pair
 * `app.tsx` wires up, so a real `Meta+k` keystroke really dispatches.
 *
 * **The 3 that stay** are genuine cross-feature navigation: each asserts on
 * `SettingsView`'s own rendered Appearance page (a heading, a radiogroup, a
 * file input) reached by running a palette command — a different feature's
 * real surface, not something `Palette` owns, and together they are this
 * view's required one-browser-smoke-test-per-view.
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
const search = (page: Page) =>
  palette(page).getByRole('combobox', { name: 'Command palette search' });

test('palette navigates to views and settings', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  await search(page).fill('Settings: Appearance');
  await page.keyboard.press('Enter');

  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
});

test('Phase 64 Theme F: "Select Theme Palette" navigates to Settings ▸ Appearance', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  await search(page).fill('Select Theme Palette');
  const row = palette(page).getByRole('option', { name: 'Select Theme Palette' });
  await expect(row).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Light palettes' })).toBeVisible();
});

test('Phase 64 Theme F: "Import VS Code Theme" navigates to Settings ▸ Appearance and opens the Palette accordion', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  await search(page).fill('Import VS Code Theme');
  const row = palette(page).getByRole('option', { name: 'Import VS Code Theme' });
  await expect(row).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(palette(page)).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await expect(page.getByLabel('Import VS Code Theme file')).toBeAttached();
});
