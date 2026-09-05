import { expect, test, type Page } from '@playwright/test';

import { fixtures } from './fixtures';
import { installMockBridge } from './mock-bridge';

/**
 * The quick-access menu (Phase 58 Theme E) — one component, two entry points.
 *
 * `Meta+l`, literal rather than Playwright's OS-adaptive `ControlOrMeta`
 * alias: `palette.spec.ts` explains why (a real Ctrl on CI's Linux runner
 * under the `Mod`-is-always-Cmd pin this suite runs under).
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

const FOUR_ROWS = ['Loops', 'Notes', 'Report Issue', 'Guided tour'];

test('the FAB opens the menu with the four rows, in order', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Open quick access panel' }).click();

  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitem')).toHaveCount(4);
  const names = await rowNames(page);
  for (const [index, name] of FOUR_ROWS.entries()) {
    expect(names[index]).toContain(name);
  }
});

test('the assistant menu opens the same component with the same four rows', async ({ page }) => {
  await open(page);
  await page.getByTestId('assistant-menu').click();

  await expect(menu(page)).toBeVisible();
  const names = await rowNames(page);
  for (const [index, name] of FOUR_ROWS.entries()) {
    expect(names[index]).toContain(name);
  }
});

test('Meta+L opens the menu, then N opens Notes', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+l');
  await expect(menu(page)).toBeVisible();

  await page.keyboard.press('n');
  await expect(page.getByTestId('notes-modal')).toBeVisible();
  // The menu closed behind it — activating a live row is a "do this and get
  // out of the way" gesture, not a "do this and let me pick another" one.
  await expect(menu(page)).toHaveCount(0);
});

test('Meta+L opens the menu, then L opens the Loops panel', async ({ page }) => {
  await open(page);
  await page.keyboard.press('Meta+l');
  await expect(menu(page)).toBeVisible();

  await page.keyboard.press('l');
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toBeVisible();
  await expect(menu(page)).toHaveCount(0);
});

test('Meta+L opens the menu, then I changes nothing and leaves the menu open', async ({
  page,
}) => {
  await open(page);
  await page.keyboard.press('Meta+l');
  await expect(menu(page)).toBeVisible();

  await page.keyboard.press('i');
  // Still up, still showing the same four rows — a disabled row's mnemonic
  // is a no-op with a hint, never a dead end that quietly closes the menu.
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByText('Coming soon')).toBeVisible();
  await expect(page.getByTestId('notes-modal')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guard', exact: true })).toHaveCount(0);
});
