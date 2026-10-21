import { expect, test, type Locator, type Page } from '@playwright/test';

import { fixtures } from '../test-support/fixtures';
import { installMockBridge } from '../test-support/mock-bridge';

/**
 * Content-area modals centre in the main view, clear of the terminal dock.
 *
 * Needs a real browser: the assertions are `getBoundingClientRect` geometry of
 * the dialog against the view stack and the terminal frame, plus
 * `elementFromPoint` hit-testing for stacking — neither exists in jsdom.
 */

type Box = { left: number; top: number; right: number; bottom: number };

async function open(page: Page): Promise<void> {
  await installMockBridge(page, fixtures);
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Commit message' })).toBeVisible();
  await page.keyboard.press('Control+`');
  await expect(page.locator('[data-terminal-frame]')).toBeVisible();
  // Let the reveal tween settle so the measured terminal box is final.
  await page.waitForTimeout(400);
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  return page.locator(selector).first().evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

async function assertClearOfTerminal(page: Page, dialog: Locator): Promise<void> {
  const panelEl = dialog.locator('> div').first();
  const panel = await panelEl.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  const terminal = await boxOf(page, '[data-terminal-frame]');
  const stack = await page.evaluate(() => {
    const frame = document.querySelector('[data-terminal-frame]')!;
    const r = frame.parentElement!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
  expect(panel.left).toBeGreaterThanOrEqual(stack.left - 1);
  expect(panel.right).toBeLessThanOrEqual(stack.right + 1);
  expect(panel.top).toBeGreaterThanOrEqual(stack.top - 1);
  // Entirely above the terminal: no overlap.
  expect(panel.bottom).toBeLessThanOrEqual(terminal.top + 1);

  // On top of the terminal, status bar and FAB where it matters: the centre hits the dialog.
  const hit = await panelEl.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return at ? el.contains(at) : false;
  });
  expect(hit).toBe(true);
}

test('a graph tag prompt centres above the open terminal and stays on top', async ({ page }) => {
  await open(page);
  const row = page.locator('[role="row"]').filter({ hasText: 'feat(phase-11)' }).first();
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Create tag here…' }).click();
  const dialog = page.getByRole('dialog', { name: /New tag at/ });
  await expect(dialog).toBeVisible();
  await assertClearOfTerminal(page, dialog);
});

test('a graph hard-reset confirm centres above the open terminal and stays on top', async ({
  page,
}) => {
  await open(page);
  const row = page.locator('[role="row"]').filter({ hasText: 'feat(phase-11)' }).first();
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Reset / }).hover();
  await page.getByRole('menuitem', { name: /Hard/ }).click();
  const dialog = page.getByRole('dialog', { name: /Hard reset/ });
  await expect(dialog).toBeVisible();
  await assertClearOfTerminal(page, dialog);
});
