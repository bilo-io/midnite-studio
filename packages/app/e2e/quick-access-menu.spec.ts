import { expect, test, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * The quick-access menu (Phase 58 Theme E) — one component, opened by the
 * large FAB button or the `Meta+l` chord. It used to also open from a second
 * status-bar trigger (`assistant-menu.tsx`'s own button); that trigger was a
 * redundant control for the identical action the FAB's `onClick` already
 * performed and was removed, so the FAB and the chord are the only entry
 * points left.
 *
 * `Meta+l`, literal rather than Playwright's OS-adaptive `ControlOrMeta`
 * alias: `palette.spec.ts` explains why (a real Ctrl on CI's Linux runner
 * under the `Mod`-is-always-Cmd pin this suite runs under).
 *
 * Phase 82 Theme C wave 5 moved 2 of this file's original 5 tests to
 * `src/features/quick-access/quick-access-menu.bridge.test.tsx`, mounting
 * `QuickAccessMenu` directly — `N` activating Notes and closing the menu
 * behind it, and `I` (a disabled row) leaving the menu open with a hint. The
 * 3 left here are all about *reaching* the component rather than its own
 * behaviour once open: the FAB opening it, the `Meta+l` chord opening it (the
 * real global keybinding dispatcher, not this menu's own `onKeyDown`), and
 * `L` opening the Loops panel (`FabPanel`, a large surface this file has no
 * reason to drag into a unit test — the dispatch mechanism itself is already
 * proven by the `I` test in the jsdom file).
 */

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
}

const menu = (page: Page) => page.getByTestId('quick-access-menu');
const rowNames = (page: Page) =>
  menu(page)
    .getByRole('menuitem')
    .evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim().split('\n')[0] ?? ''));

/*
  Five since Phase 79 Theme C put `Companion` between Loops and Notes. Not
  six: the companion's own `Repeat` row is absent until it has said something,
  and nothing here makes it speak — see `companion-panel.spec.ts`.
*/
const FIVE_ROWS = ['Loops', 'Companion', 'Notes', 'Report Issue', 'Guided tour'];

test('the FAB opens the menu with the five rows, in order', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Open quick access panel' }).click();

  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitem')).toHaveCount(5);
  const names = await rowNames(page);
  for (const [index, name] of FIVE_ROWS.entries()) {
    expect(names[index]).toContain(name);
  }
});

test('the Meta+L chord opens the same component with the same five rows', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+l');

  await expect(menu(page)).toBeVisible();
  const names = await rowNames(page);
  for (const [index, name] of FIVE_ROWS.entries()) {
    expect(names[index]).toContain(name);
  }
});

test('Meta+L opens the menu, then L opens the Loops panel', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+l');
  await expect(menu(page)).toBeVisible();

  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeVisible();
  await expect(menu(page)).toHaveCount(0);
});
