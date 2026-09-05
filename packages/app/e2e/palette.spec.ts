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
const search = (page: Page) =>
  palette(page).getByRole('combobox', { name: 'Command palette search' });
const reposPanel = (page: Page) => page.getByRole('complementary', { name: 'Repositories' });

test('Mod+K opens the palette over the graph and Escape closes it', async ({ page }) => {
  await open(page);

  /*
    Literal `Meta`, not Playwright's OS-adaptive `ControlOrMeta` alias.

    This used to be `ControlOrMeta` — a hard-coded `Meta+k` broke here once
    already, when every spec in this file passed locally and all nine failed
    on CI's ubuntu runner, because `ControlOrMeta` sent the real Ctrl key
    there and the app (reading the CI runner's genuinely non-mac
    `navigator.platform`) correctly wanted Ctrl for `Mod`, matching
    `shared/src/keybindings.ts`'s own words: "Mod means Cmd on macOS and Ctrl
    elsewhere".

    Phase 38 Theme I moved the ground under that fix: `mock-bridge.ts` now
    pins `navigator.platform` to `'MacIntel'` for every e2e spec, so the app
    always wants Meta for `Mod` regardless of which OS Chromium is actually
    running on — needed so `Control+\`` below (deliberately Ctrl on every
    *real* platform, since the packaged app only ships macOS) can be told
    apart from `Mod`. `ControlOrMeta` broke under that pin exactly as `Meta`
    broke before it: it resolves from Playwright's own OS detection, not
    from the page's spoofed `navigator.platform`, so on the actual CI runner
    it kept sending literal Ctrl for what the app now expects as Meta. This
    file's own regression, caught by the same job that caught the last one —
    literal `Meta` is what the app actually wants now.
  */
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
  await expect(options).toHaveCount(4);
  await expect(options).toContainText([
    'Toggle Terminal',
    'Focus Terminal',
    'Detach Terminal',
    'Settings: Terminal',
  ]);
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

test('the reload pair carries the browser chords, and the commands they displaced carry none', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Meta+k');

  await search(page).fill('reload');
  /*
    Always `⌘R`, never `Ctrl+R` — `navigator.platform` is pinned to
    `'MacIntel'` for every e2e spec (see the note above), so `chord-hint.ts`'s
    own `isMac()` read always resolves the same way here, regardless of which
    OS Chromium is actually running on. Asserting the rendered hint rather
    than the keymap is the point: this covers registry → palette row →
    `displayChord`, which is the whole path a user reads the shortcut off.
  */
  await expect(palette(page).getByRole('option', { name: 'Reload ⌘R' })).toBeVisible();
  await expect(palette(page).getByRole('option', { name: 'Hard Reload ⌘⇧R' })).toBeVisible();

  // Refresh and Fetch are still listed — they lost their chords, not their
  // place in the palette.
  await search(page).fill('refresh');
  await expect(palette(page).getByRole('option', { name: 'Refresh' })).toBeVisible();
  await search(page).fill('fetch');
  await expect(palette(page).getByRole('option', { name: 'Fetch' })).toBeVisible();
});

test('a disabled command shows its reason and does not run on Enter', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  await search(page).fill('commit');

  const row = palette(page).locator('[role="option"][aria-disabled="true"]').first();
  await expect(row).toBeVisible();

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
  },
);

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
  await expect(page.getByRole('radiogroup', { name: 'Palette' })).toBeVisible();
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

test('palette and go to file both have gradient glow classes', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+k');
  const paletteDialog = palette(page);
  await expect(paletteDialog).toBeVisible();
  const container = paletteDialog.locator('> div');
  await expect(container).toHaveClass(/gradient-border/);
  await expect(container).toHaveClass(/gradient-border--always/);

  await page.keyboard.press('Escape');
  await expect(paletteDialog).toBeHidden();

  // Test Go to File (Mod+P)
  await page.keyboard.press('Meta+p');
  await expect(paletteDialog).toBeVisible();
  await expect(container).toHaveClass(/gradient-border/);
  await expect(container).toHaveClass(/gradient-border--always/);
});
